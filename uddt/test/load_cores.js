// index.html 의 DRAW_CORE·BRACKET_CORE 블록을 그대로 추출해 Node 에서 쓰게 한다(출하 코드 = 테스트 코드).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extract(html, begin, end, file){
  const re = new RegExp('/\\* ' + begin + '[\\s\\S]*?\\*/([\\s\\S]*?)/\\* ' + end + ' \\*/');
  const m = html.match(re);
  if (!m) throw new Error('index.html 에서 ' + begin + ' 블록을 찾지 못함');
  const factory = vm.runInThisContext('(function(module){' + m[1] + '\n})', { filename: file });
  const mod = { exports: {} }; factory(mod);
  return mod.exports;
}
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
module.exports = {
  DrawCore: extract(html, 'DRAW_CORE_BEGIN', 'DRAW_CORE_END', 'draw_core.extracted.js'),
  BracketCore: extract(html, 'BRACKET_CORE_BEGIN', 'BRACKET_CORE_END', 'bracket_core.extracted.js')
};
