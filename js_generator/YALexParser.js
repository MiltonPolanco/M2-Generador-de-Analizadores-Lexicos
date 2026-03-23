// YALexParser.js
import fs from 'fs';

export class YALexParser {
  constructor(filepath) {
    this.source = fs.readFileSync(filepath, 'utf8').replace(/\r/g, '');
    this.header = '';
    this.trailer = '';
    this.lets = {}; // name -> expanded regex string
    this.rules = []; // { regex: string, action: string, actionName: string }
  }

  parse() {
    let content = this.source;

    content = this.removeComments(content);

    const headerMatch = content.match(/^\s*\{([\s\S]*?)\}/);
    if (headerMatch) {
      this.header = headerMatch[1].trim();
      content = content.replace(headerMatch[0], '');
    }



    // 4. Parse 'let's
    const letRegex = /let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^let|rule]*?)(?=\s*(let|rule|{|\|))/g;

    const tokens = this.tokenize(content);

    let i = 0;
    while (i < tokens.length) {
      if (tokens[i] === 'let') {
        let name = tokens[i + 1];
        let eq = tokens[i + 2];
        if (eq !== '=') throw new Error(`Expected '=' after let ${name}`);

        let j = i + 3;
        let regexTokens = [];
        while (j < tokens.length && tokens[j] !== 'let' && tokens[j] !== 'rule') {
          regexTokens.push(tokens[j]);
          j++;
        }

        let expanded = this.expandLet(regexTokens);
        this.lets[name] = expanded;

        i = j;
      } else if (tokens[i] === 'rule') {
        // Parse rules
        let entrypoint = tokens[i + 1];
        let eq = tokens[i + 2];

        let j = i + 2;
        while (tokens[j] !== '=') j++;
        j++;

        let currentRegexTokens = [];
        let ruleCounter = 1;
        while (j < tokens.length) {
          if (tokens[j] === '|') {
            j++;
            continue;
          }

          if (tokens[j] === '{' && tokens[j - 1] !== "{" && tokens[j - 1] !== "'{'") {
          }


          break;
        }
        break;
      } else {
        i++;
      }
    }

    // Robust Rule Parsing from raw string
    const ruleStart = content.search(/rule\s+[a-zA-Z0-9_]+\s*(?:\[.*?\])?\s*=/);
    if (ruleStart !== -1) {
      let ruleSection = content.slice(ruleStart);

      // Remove trailer if exists
      const lastActionEnd = ruleSection.lastIndexOf('}');
      if (lastActionEnd !== -1) {
        let potentialTrailer = ruleSection.slice(lastActionEnd + 1).trim();
        if (potentialTrailer.startsWith('{')) {
          const trailerEnd = potentialTrailer.lastIndexOf('}');
          this.trailer = potentialTrailer.slice(1, trailerEnd).trim();
          ruleSection = ruleSection.slice(0, lastActionEnd + 1);
        }
      }

      // Find '='
      let eqIndex = ruleSection.indexOf('=');
      let ruleBody = ruleSection.slice(eqIndex + 1);


      let branches = this.splitRules(ruleBody);

      // Parse each branch into regex and action
      let ruleId = 1;
      for (let b of branches) {
        let actionMatch = this.extractAction(b);
        if (actionMatch) {
          let pureRegex = b.slice(0, actionMatch.index).trim();
          // Expand lets in regex
          let expandedRegex = this.expandRegex(pureRegex);
          this.rules.push({
            regex: expandedRegex,
            action: actionMatch.action,
            actionName: `#${ruleId}`
          });
          ruleId++;
        }
      }
    }
  }

  tokenize(str) {
    let tokens = [];
    let i = 0;
    while (i < str.length) {
      let c = str[i];
      if (/\s/.test(c)) { i++; continue; }

      if (c === '[') {
        let start = i;
        i++;
        if (str[i] === '^') i++;
        while (str[i] !== ']' && i < str.length) {
          if (str[i] === '\\') i++; // skip escaped \]
          i++;
        }
        tokens.push(str.slice(start, i + 1));
        i++;
      } else if (c === "'" || c === '"') {
        let start = i;
        i++;
        while (str[i] !== c && i < str.length) {
          if (str[i] === '\\') i++;
          i++;
        }
        tokens.push(str.slice(start, i + 1));
        i++;
      } else if (/[a-zA-Z_]/.test(c)) {
        let start = i;
        while (/[a-zA-Z0-9_]/.test(str[i]) && i < str.length) i++;
        tokens.push(str.slice(start, i));
      } else {
        tokens.push(c);
        i++;
      }
    }
    return tokens;
  }

  expandLet(regexTokens) {
    let result = [];
    for (let t of regexTokens) {
      if (this.lets[t]) {
        result.push(`(${this.lets[t]})`); // enclose in parens to avoid precedence issues
      } else {
        result.push(t);
      }
    }
    return result.join(' ');
  }

  expandRegex(pureRegexStr) {
    let tokens = this.tokenize(pureRegexStr);
    return this.expandLet(tokens);
  }

  splitRules(ruleBody) {
    let branches = [];
    let i = 0;
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let inBracket = false;
    let inAction = false;
    let actionBraceCount = 0;

    // Skip leading |
    ruleBody = ruleBody.trim();
    if (ruleBody.startsWith('|')) {
      ruleBody = ruleBody.slice(1).trim();
    }

    while (i < ruleBody.length) {
      let c = ruleBody[i];

      if (inQuote) {
        if (c === '\\') {
          current += c;
          i++;
          current += ruleBody[i];
        } else if (c === quoteChar) {
          inQuote = false;
          current += c;
        } else {
          current += c;
        }
      }
      else if (inBracket) {
        if (c === '\\') {
          current += c;
          i++;
          current += ruleBody[i];
        } else if (c === ']') {
          inBracket = false;
          current += c;
        } else {
          current += c;
        }
      }
      else if (inAction) {
        if (c === '{') actionBraceCount++;
        else if (c === '}') {
          actionBraceCount--;
          if (actionBraceCount === 0) {
            inAction = false;
          }
        }
        current += c;
      }
      else {
        if (c === "'" || c === '"') {
          inQuote = true;
          quoteChar = c;
          current += c;
        } else if (c === '[') {
          inBracket = true;
          current += c;
        } else if (c === '{') {
          inAction = true;
          actionBraceCount = 1;
          current += c;
        } else if (c === '|') {
          // Not in quotes/brackets/action, so it's a branch separator
          branches.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      i++;
    }
    if (current.trim()) branches.push(current.trim());
    return branches;
  }

  extractAction(branch) {
    let braceIndex = branch.lastIndexOf('}');
    if (braceIndex === -1) return null;
    let startBrace = branch.lastIndexOf('{', braceIndex);
    if (startBrace === -1) return null;

    let actionText = branch.slice(startBrace + 1, braceIndex).trim();
    return { action: actionText, index: startBrace };
  }

  removeComments(str) {
    let result = '';
    let i = 0;
    while (i < str.length) {
      if (str[i] === '(' && str[i + 1] === '*') {
        i += 2;
        while (i < str.length && !(str[i] === '*' && str[i + 1] === ')')) {
          i++;
        }
        i += 2;
      } else {
        result += str[i];
        i++;
      }
    }
    return result;
  }
}
