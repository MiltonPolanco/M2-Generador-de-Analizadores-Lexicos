import { ASTNode } from './ASTNode.js';

export function tokenStringToASTTokens(str) {
  let tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (str[i] === '[') {
      let start = i;
      i++;
      if (str[i] === '^') i++;
      while (str[i] !== ']' && i < str.length) {
        if (str[i] === '\\') i++;
        i++;
      }
      tokens.push(str.slice(start, i + 1));
      i++;
    } else if (str[i] === "'" || str[i] === '"') {
      let quote = str[i];
      let start = i;
      i++;
      while (str[i] !== quote && i < str.length) {
        if (str[i] === '\\') i++;
        i++;
      }
      tokens.push(str.slice(start, i + 1));
      i++;
    } else {
      tokens.push(str[i]);
      i++;
    }
  }
  return tokens;
}

export function expandTokens(tokens) {
  let expanded = [];
  for (let t of tokens) {
    if (t.startsWith('[')) {
      // character class [...]
      let isNegated = t.startsWith('[^');
      let inner = t.slice(isNegated ? 2 : 1, -1);
      let charList = parseCharClassInner(inner);
      if (isNegated) {
        let allChars = [];
        for (let code = 32; code <= 126; code++) {
          let char = String.fromCharCode(code);
          let rep = char;
          if (char === '\\') rep = '\\\\';
          else if (char === "'") rep = "\\'";
          let term = `'${rep}'`;
          if (!charList.includes(`'${char}'`) && !charList.includes(`"'"`) && !charList.includes(term)) {
            allChars.push(term);
          }
        }
        if (!charList.includes("'\\t'")) allChars.push("'\\t'");
        if (!charList.includes("'\\r'")) allChars.push("'\\r'");
        if (!charList.includes("'\\n'")) allChars.push("'\\n'");
        if (!charList.includes(`' '`)) allChars.push(`' '`);

        if (allChars.length > 0) {
          expanded.push('(');
          for (let i = 0; i < allChars.length; i++) {
            expanded.push(allChars[i]);
            if (i < allChars.length - 1) expanded.push('|');
          }
          expanded.push(')');
        }
      } else {
        if (charList.length === 0) continue;
        if (charList.length === 1) expanded.push(charList[0]);
        else {
          expanded.push('(');
          for (let i = 0; i < charList.length; i++) {
            expanded.push(charList[i]);
            if (i < charList.length - 1) expanded.push('|');
          }
          expanded.push(')');
        }
      }
    } else if (t.startsWith('"')) {

      let inner = t.slice(1, -1);
      let chars = parseStringInner(inner);
      if (chars.length === 0) { } // empty
      else if (chars.length === 1) expanded.push(chars[0]);
      else {
        expanded.push('(');
        for (let i = 0; i < chars.length; i++) {
          expanded.push(chars[i]);
          if (i < chars.length - 1) expanded.push('.');
        }
        expanded.push(')');
      }
    } else if (t === '+') {

      expanded.push('+');
    } else if (t === '?') {

      expanded.push('?');
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

function parseCharClassInner(inner) {
  let chars = [];
  let i = 0;
  while (i < inner.length) {
    if (/\s/.test(inner[i])) { i++; continue; }
    if (inner[i] === "'" || inner[i] === '"') {
      let quote = inner[i];
      let start = i;
      i++;
      while (inner[i] !== quote && i < inner.length) {
        if (inner[i] === '\\') i++;
        i++;
      }
      let c = inner.slice(start, i + 1);
      i++;
      // Check for range
      let nextNonSpace = i;
      while (nextNonSpace < inner.length && /\s/.test(inner[nextNonSpace])) nextNonSpace++;
      if (inner[nextNonSpace] === '-') {
        let rangeDash = nextNonSpace++;
        while (nextNonSpace < inner.length && /\s/.test(inner[nextNonSpace])) nextNonSpace++;
        if (inner[nextNonSpace] === "'" || inner[nextNonSpace] === '"') {
          let q2 = inner[nextNonSpace];
          let s2 = nextNonSpace;
          nextNonSpace++;
          while (inner[nextNonSpace] !== q2 && nextNonSpace < inner.length) {
            if (inner[nextNonSpace] === '\\') nextNonSpace++;
            nextNonSpace++;
          }
          let c2 = inner.slice(s2, nextNonSpace + 1);
          // chars.push(`${c}-${c2}`); 
          // Expand the range from charCode c to c2
          let startChar = c.replace(/['"]/g, '');
          let endChar = c2.replace(/['"]/g, '');
          if (startChar.length === 1 && endChar.length === 1) {
            for (let code = startChar.charCodeAt(0); code <= endChar.charCodeAt(0); code++) {
              chars.push(`'${String.fromCharCode(code)}'`);
            }
          } else {
            chars.push(c); chars.push(c2); // fallback
          }
          i = nextNonSpace + 1;
          continue;
        }
      }
      chars.push(c);
    } else {
      chars.push(`'${inner[i]}'`);
      i++;
    }
  }
  return chars;
}

function parseStringInner(inner) {
  let chars = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '\\') {
      chars.push(`'\\${inner[i + 1]}'`);
      i += 2;
    } else {
      chars.push(`'${inner[i]}'`);
      i++;
    }
  }
  return chars;
}

export function insertExplicitConcat(tokens) {
  let result = [];
  for (let i = 0; i < tokens.length; i++) {
    let t1 = tokens[i];
    result.push(t1);
    if (i < tokens.length - 1) {
      let t2 = tokens[i + 1];

      let isT1Operand = !['|', '(', '.', '#'].includes(t1);
      let isT2Operand = !['|', ')', '*', '+', '?', '.', '#'].includes(t2);

      if (t1.match(/^#\d+$/)) isT1Operand = false; // end symbol

      if (isT1Operand && isT2Operand) {
        result.push('.');
      }
    }
  }
  return result;
}

function getPrecedence(c) {
  if (['*', '+', '?'].includes(c)) return 3;
  if (c === '.') return 2;
  if (c === '|') return 1;
  return 0;
}

export function infixToPostfix(tokens) {
  let postfix = [];
  let stack = [];

  for (let t of tokens) {
    if (!['|', '.', '*', '+', '?', '(', ')'].includes(t)) {
      postfix.push(t);
    } else if (t === '(') {
      stack.push(t);
    } else if (t === ')') {
      while (stack.length > 0 && stack[stack.length - 1] !== '(') {
        postfix.push(stack.pop());
      }
      stack.pop();
    } else {
      while (
        stack.length > 0 &&
        getPrecedence(stack[stack.length - 1]) >= getPrecedence(t)
      ) {
        postfix.push(stack.pop());
      }
      stack.push(t);
    }
  }
  while (stack.length > 0) postfix.push(stack.pop());
  return postfix;
}

export function buildAST(postfix, idRef = { current: 1 }) {
  let stack = [];

  for (let t of postfix) {
    if (t === '*') {
      let node = new ASTNode(t);
      node.left = stack.pop();
      stack.push(node);
    } else if (t === '+') {
      let r = stack.pop();
      // create AST for R . R*
      let concatNode = new ASTNode('.');
      concatNode.left = r;

      let node = new ASTNode('+');
      node.left = r;
      stack.push(node);
    } else if (t === '?') {
      let r = stack.pop();
      let node = new ASTNode('?');
      node.left = r;
      stack.push(node);
    } else if (t === '.' || t === '|') {
      let node = new ASTNode(t);
      node.right = stack.pop();
      node.left = stack.pop();
      stack.push(node);
    } else {
      let val = t;
      if (val.startsWith("'") && val.endsWith("'") && val.length >= 3) {
        val = val.slice(1, -1);
        val = val.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\').replace(/\\'/g, "'").replace(/\\"/g, '"');
      } else if (val.startsWith('"') && val.endsWith('"') && val.length >= 3) {
        val = val.slice(1, -1);
        val = val.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
      }

      if (val === 'eof' || val === "eof") val = 'eof'; // standard eof
      let node = new ASTNode(val, idRef.current++);
      stack.push(node);
    }
  }
  return stack.pop();
}

