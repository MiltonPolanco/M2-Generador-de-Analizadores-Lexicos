import { YALexParser } from './YALexParser.js';
import process from 'process';

try {
  const filepath = process.argv[2];
  const parser = new YALexParser(filepath);
  parser.parse();
  console.log("---- HEADER ----");
  console.log(parser.header);
  console.log("---- LETS ----");
  for (let k in parser.lets) {
      console.log(`let ${k} = ${parser.lets[k]}`);
  }
  console.log("---- RULES ----");
  parser.rules.forEach(r => {
      console.log(`ActionName: ${r.actionName}\nRegex: ${r.regex}\nAction Code: ${r.action}\n---`);
  });
} catch (e) {
  console.error("Error parsing YALex:", e);
}
