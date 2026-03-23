// DirectDFA.js

export function evaluateNode(node) {
  if (!node) return;

  if (node.id !== null) {
    node.nullable = false;
    node.firstpos.add(node.id);
    node.lastpos.add(node.id);
    return;
  }

  evaluateNode(node.left);
  evaluateNode(node.right);

  if (node.value === 'ε' || node.value === "''" || node.value === '""') {
    node.nullable = true;
  } else if (node.value === '|') {
    node.nullable = node.left.nullable || node.right.nullable;
    node.firstpos = new Set([...node.left.firstpos, ...node.right.firstpos]);
    node.lastpos = new Set([...node.left.lastpos, ...node.right.lastpos]);
  } else if (node.value === '.') {
    node.nullable = node.left.nullable && node.right.nullable;
    
    node.firstpos = node.left.nullable 
      ? new Set([...node.left.firstpos, ...node.right.firstpos])
      : new Set(node.left.firstpos);

    node.lastpos = node.right.nullable
      ? new Set([...node.left.lastpos, ...node.right.lastpos])
      : new Set(node.right.lastpos);
  } else if (node.value === '*') {
    node.nullable = true;
    node.firstpos = new Set(node.left.firstpos);
    node.lastpos = new Set(node.left.lastpos);
  } else if (node.value === '+') {
    node.nullable = node.left.nullable;
    node.firstpos = new Set(node.left.firstpos);
    node.lastpos = new Set(node.left.lastpos);
  } else if (node.value === '?') {
    node.nullable = true;
    node.firstpos = new Set(node.left.firstpos);
    node.lastpos = new Set(node.left.lastpos);
  }
}

export function calculateFollowPos(node, followposTable) {
  if (!node) return;
  
  if (node.id !== null) return; // leaf node

  calculateFollowPos(node.left, followposTable);
  calculateFollowPos(node.right, followposTable);

  if (node.value === '.') {
    for (let i of node.left.lastpos) {
      if (!followposTable[i]) followposTable[i] = new Set();
      for (let first of node.right.firstpos) {
        followposTable[i].add(first);
      }
    }
  } else if (node.value === '*' || node.value === '+') {
    for (let i of node.lastpos) {
      if (!followposTable[i]) followposTable[i] = new Set();
      for (let first of node.firstpos) {
        followposTable[i].add(first);
      }
    }
  }
}

export function getSymbolMap(node, map = {}) {
  if (!node) return map;
  if (node.id !== null) {
    map[node.id] = node.value;
  }
  getSymbolMap(node.left, map);
  getSymbolMap(node.right, map);
  return map;
}

export function buildDFA(rootNode, followposTable, symbolMap) {
  let dStates = [];
  let transitions = [];
  let unvisitedStates = [];

  const getStateName = (set) => Array.from(set).sort((a,b) => a-b).join(',');

  let initialStateName = getStateName(rootNode.firstpos);
  dStates.push(initialStateName);
  unvisitedStates.push(initialStateName);

  while (unvisitedStates.length > 0) {
    let currentStateName = unvisitedStates.shift();
    let currentStateArray = currentStateName ? currentStateName.split(',').map(Number) : [];

    let symbols = new Set();
    currentStateArray.forEach(pos => {
      let sym = symbolMap[pos];
      if (sym && !sym.match(/^#\d+$/)) {
        symbols.add(sym);
      }
    });

    symbols.forEach(symbol => {
      let nextStateSet = new Set();
      
      currentStateArray.forEach(pos => {
        if (symbolMap[pos] === symbol && followposTable[pos]) {
          followposTable[pos].forEach(nextPos => nextStateSet.add(nextPos));
        }
      });

      if (nextStateSet.size > 0) {
        let nextStateName = getStateName(nextStateSet);

        if (!dStates.includes(nextStateName)) {
          dStates.push(nextStateName);
          unvisitedStates.push(nextStateName);
        }

        transitions.push({
          from: currentStateName,
          symbol: symbol,
          to: nextStateName
        });
      }
    });
  }
  
  return { dStates, transitions };
}
