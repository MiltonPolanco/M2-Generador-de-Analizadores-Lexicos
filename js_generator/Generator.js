import fs from 'fs';

export function generatePythonLexer(dfa, symbolMap, rules, outputPath, header) {
    let acceptStates = {};

    for (let stateName of dfa.dStates) {
        let positions = stateName.split(',').map(Number);
        let accepts = [];
        positions.forEach(pos => {
            let sym = symbolMap[pos];
            if (sym && sym.match(/^#\d+$/)) {
                accepts.push(sym);
            }
        });

        if (accepts.length > 0) {
            accepts.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
            acceptStates[stateName] = accepts[0]; // The winning rule ID for this state
        }
    }

    // Build Transition Table format for Python
    let pyTransitions = '{\n';
    dfa.dStates.forEach(state => {
        let edges = dfa.transitions.filter(t => t.from === state);
        if (edges.length > 0) {
            pyTransitions += `    "${state}": {\n`;
            edges.forEach(e => {
                let sym = e.symbol;
                if (sym.startsWith("'") && sym.endsWith("'")) {
                    sym = sym.slice(1, -1);
                }
                if (sym === '\\') sym = '\\\\';
                else if (sym === '"') sym = '\\"';
                else if (sym === '\n') sym = '\\n';
                else if (sym === '\t') sym = '\\t';
                else if (sym === '\r') sym = '\\r';

                pyTransitions += `        "${sym}": "${e.to}",\n`;
            });
            pyTransitions += `    },\n`;
        }
    });
    pyTransitions += '}\n';

    let pyAccepts = '{\n';
    for (let state in acceptStates) {
        pyAccepts += `    "${state}": "${acceptStates[state]}",\n`;
    }
    pyAccepts += '}\n';

    let actionsCode = 'def execute_action(rule_id, lxm):\n    lexbuf = lxm\n';
    rules.forEach(r => {
        actionsCode += `    if rule_id == "${r.actionName}":\n`;

        let actionLines = r.action.split('\n');
        actionLines.forEach(l => {
            let modifiedLine = l.replace(/return\s+lexbuf;?/g, 'return None # skip whitespaces');
            modifiedLine = modifiedLine.replace(/return\s+([A-Z_a-z0-9_]+)\s*\(\s*lxm\s*\);?/g, 'val = lxm.replace(\'"\', \'\\\\"\')\n        return f"$1(\\"{val}\\")"');
            modifiedLine = modifiedLine.replace(/return\s+(?!None)([A-Z_a-z0-9_]+)\s*;?$/g, 'return "$1"');
            actionsCode += `        ${modifiedLine.trim()}\n`;
        });
    });
    actionsCode += `    return None\n`;

    const template = `#!/usr/bin/env python3
import sys

# --- HEADER FROM YALEX ---
${header}
# -------------------------

TRANSITIONS = ${pyTransitions}
ACCEPT_STATES = ${pyAccepts}
INITIAL_STATE = "${dfa.dStates[0]}"

${actionsCode}

def tokenize(input_string):
    tokens = []
    pos = 0
    line = 1
    col = 1
    
    while pos < len(input_string):
        state = INITIAL_STATE
        last_accept_state = None
        last_accept_pos = -1
        current_pos = pos
        
        while current_pos < len(input_string):
            char = input_string[current_pos]
            if state in TRANSITIONS and char in TRANSITIONS[state]:
                state = TRANSITIONS[state][char]
                if state in ACCEPT_STATES:
                    last_accept_state = state
                    last_accept_pos = current_pos
                current_pos += 1
            else:
                break
                
        if last_accept_state is None:
            # Check for EOF rule when pos at end? The YALex handles EOF via specific rules if implemented.
            char = input_string[pos]
            print(f"LEXICAL ERROR at line {line}, col {col}: Unrecognized character '{char}'")
            return None
        
        # We matched something!
        lxm = input_string[pos : last_accept_pos + 1]
        rule_id = ACCEPT_STATES[last_accept_state]
        
        token = execute_action(rule_id, lxm)
        if token is not None:
            tokens.append(token)
            
        # Update line and column
        for c in lxm:
            if c == '\\n':
                line += 1
                col = 1
            else:
                col += 1
                
        pos = last_accept_pos + 1
        
    # Process EOF
    state = INITIAL_STATE
    if state in TRANSITIONS and "eof" in TRANSITIONS[state]:
        state = TRANSITIONS[state]["eof"]
        if state in ACCEPT_STATES:
            execute_action(ACCEPT_STATES[state], "")
            
    return tokens

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            content = f.read()
    else:
        content = sys.stdin.read()
        
    if content and not content.endswith('\\n'):
        content += '\\n'
        
    result = tokenize(content)
    if result:
        for t in result:
            print(t)
`;

    fs.writeFileSync(outputPath, template, 'utf8');
}
