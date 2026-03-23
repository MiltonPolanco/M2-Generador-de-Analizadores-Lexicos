import fs from 'fs';
import path from 'path';
import { YALexParser } from './YALexParser.js';
import { tokenStringToASTTokens, expandTokens, insertExplicitConcat, infixToPostfix, buildAST } from './RegexToAST.js';
import { evaluateNode, calculateFollowPos, getSymbolMap, buildDFA } from './DirectDFA.js';
import { generatePythonLexer } from './Generator.js';
import { ASTNode } from './ASTNode.js';

try {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node index.js <file.yal> [-o <output.py>]");
    process.exit(1);
  }

  const inputFile = args[0];
  let outputFile = 'thelexer.py';
  if (args[1] === '-o' && args[2]) {
    outputFile = args[2];
  }

  console.log(`[1] Parsing ${inputFile}...`);
  const parser = new YALexParser(inputFile);
  parser.parse();

  console.log(`[2] Building global AST from ${parser.rules.length} rules...`);
  let rootNode = null;
  let globalIdRef = { current: 1 };

  parser.rules.forEach((rule, idx) => {
    // 1. Tokenize pure regex string
    let tokens = tokenStringToASTTokens(rule.regex);
    // 2. Expand sets like [a-z], strings "abc", options ?, closures +
    let expanded = expandTokens(tokens);
    // 3. Append the end marker specific to this rule
    expanded.push(rule.actionName);
    let withConcat = insertExplicitConcat(expanded);
    let postfix = infixToPostfix(withConcat);
    let ast = buildAST(postfix, globalIdRef);

    if (rootNode === null) {
      rootNode = ast;
    } else {
      let orNode = new ASTNode('|');
      orNode.left = rootNode;
      orNode.right = ast;
      rootNode = orNode;
    }
  });

  console.log(`[3] Evaluating AST (Nullable, Firstpos, Lastpos)...`);
  evaluateNode(rootNode);

  console.log(`[4] Calculating Followpos Table...`);
  const followposTable = {};
  calculateFollowPos(rootNode, followposTable);

  console.log(`[5] Building DFA...`);
  const symbolMap = getSymbolMap(rootNode);
  const dfa = buildDFA(rootNode, followposTable, symbolMap);
  console.log(`    Generated ${dfa.dStates.length} states and ${dfa.transitions.length} transitions.`);

  console.log(`[6] Generating Python Lexer: ${outputFile}...`);
  generatePythonLexer(dfa, symbolMap, parser.rules, outputFile, parser.header);

  // Generating Graph
  console.log(`[7] Generating DFA Graph (grafo_afd.html)...`);
  const stateToIdMap = {};
  dfa.dStates.forEach((state, ind) => {
    stateToIdMap[state] = `S${ind}`;
  });

  let visNodes = dfa.dStates.map((state, ind) => {
    // Find what rule it accepts, if any
    let positions = state.split(',').map(Number);
    let isAccept = false;
    let ruleStr = "";
    positions.forEach(pos => {
      let sym = symbolMap[pos];
      if (sym && sym.match(/^#\d+$/)) {
        isAccept = true;
        ruleStr += sym + " ";
      }
    });

    let displayLabel = stateToIdMap[state];
    return {
      id: state,
      label: isAccept ? displayLabel + "\\n(" + ruleStr.trim() + ")" : displayLabel,
      title: "Nodos: " + state,
      shape: isAccept ? 'box' : 'circle',
      color: isAccept ? '#a5d6a7' : '#90caf9'
    };
  });

  let edgeMap = {};
  dfa.transitions.forEach(t => {
    const key = `${t.from}->${t.to}`;
    if (edgeMap[key]) {
      edgeMap[key].label += `, ${t.symbol}`;
    } else {
      edgeMap[key] = {
        from: t.from,
        to: t.to,
        label: t.symbol,
        arrows: 'to',
        font: { align: 'top' }
      };
    }
  });

  var edgesArray = Object.values(edgeMap).map(e => {
    let chars = e.label.split(', ');
    if (chars.length > 5) {
      e.title = e.label;
      e.label = chars.slice(0, 4).join(', ') + '... (+' + (chars.length - 4) + ')';
    }
    return e;
  });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Visualizador de AFD - YALex</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; background-color: #f4f4f9; }
        #mynetwork { width: 90vw; height: 80vh; border: 2px solid #ccc; background-color: white; border-radius: 10px; margin-top: 20px; }
    </style>
</head>
<body>
    <h2>Autómata Finito Determinista (AFD) Generado</h2>
    <div id="mynetwork"></div>
    <script type="text/javascript">
        var nodes = new vis.DataSet(${JSON.stringify(visNodes)});
        var edges = new vis.DataSet(${JSON.stringify(edgesArray)});
        var container = document.getElementById('mynetwork');
        var data = { nodes: nodes, edges: edges };
        var options = {
            physics: { enabled: true, repulsion: { nodeDistance: 200 }, solver: 'forceAtlas2Based' },
            edges: { smooth: { type: 'curvedCW', roundness: 0.2 } }
        };
        var network = new vis.Network(container, data, options);
    </script>
</body>
</html>
`;
  const outDir = path.dirname(outputFile);
  fs.writeFileSync(path.join(outDir, 'grafo_afd.html'), htmlContent);

  console.log(`Done! Run "python ${outputFile} input.txt" to test.`);
} catch (e) {
  console.error("Fatal error:", e);
}
