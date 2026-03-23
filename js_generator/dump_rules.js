import { YALexParser } from './YALexParser.js';
const parser = new YALexParser('..\\pico.yal');
parser.parse();
parser.rules.forEach((r, i) => console.log(`Rule ${i}: ${r.regex}`));
