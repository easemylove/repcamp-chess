// Сюжет: одна смена Rep Camp. Задачи из тренера (lichess), игрок всегда за лагерь (белые).
const ORG = 'главный орг', KAIF = 'кайфарик', JUDGE = 'судья', BOSS = 'босс';

export const CHAPTERS = [
  {
    time: 'пт 17:00', title: 'заезд', kind: 'puzzle', goal: 'мат в один ход',
    puzzle: ['1idCi', 'r4rBk/ppp1npp1/3bpq2/3p4/3P4/2P1PNP1/PPQ2PP1/R3K2R b KQ - 12 18', 'h8g8 c2h7'],
    intro: [[ORG, 'о, залетай. сумки кидай в дом, глинтвейн на кухне.'], [ORG, 'пока все заезжают, орги решили проверить новеньких.'], [JUDGE, 'на доске мат в один ход. найдёшь — заселяем без очереди.']],
    outro: [[ORG, 'ладно, ладно. заселяйся.'], [KAIF, 'в 21:30 открытие, не опаздывай.']],
  },
  {
    time: 'пт 21:30', title: 'открытие', kind: 'puzzle', goal: 'найди вилку',
    puzzle: ['3twhI', '3r2k1/ppq1brpp/3pp3/2p1P3/4Nn2/1P4Q1/PBP2PPP/3R1RK1 w - - 7 17', 'e5d6 f4e2 g1h1 e2g3'],
    intro: [[BOSS, 'добро пожаловать на зимний Rep Camp!'], [BOSS, 'правило лагеря одно: двигаем фигурки и не душним.'], [KAIF, 'орги уже раздали браслеты команд. тебе выпали ладьи.'], [BOSS, 'разминка: один ход, две цели. как глинтвейн и плед.']],
    outro: [[BOSS, 'вилка как по учебнику.'], [KAIF, 'дальше костёр, мафия и спать. ну, или не спать.']],
  },
  {
    time: 'сб 11:00', title: 'лекция для продолжашек', kind: 'puzzle', goal: 'мат в два хода',
    puzzle: ['2b00Z', '3r3k/pQ2b1pp/b1n2p2/q3pN2/8/2N1B3/PP3PPP/3R2K1 w - - 3 22', 'b7c6 d8d1 c3d1 a5e1'],
    intro: [[JUDGE, 'доброе утро. кто был на зарядке, тому плюс к карме.'], [JUDGE, 'сегодня тема — мат в два хода. первый ход тихий, второй громкий.']],
    outro: [[JUDGE, 'красиво. записываю в продолжашки.'], [KAIF, 'в 15:00 турнир. пойдём пообедаем.']],
  },
  {
    time: 'сб 15:00', title: 'официальный турнир', kind: 'game', level: 1, goal: 'обыграй орга-продолжашку',
    intro: [[JUDGE, 'официальный рейтинговый турнир. телефоны в карман.'], [JUDGE, 'твой соперник — орг-продолжашка. жмём руки, часы пошли.']],
    outro: [[JUDGE, 'победа. запишу в протокол.'], [KAIF, 'вечером музлото, а в полночь Тайный Санта.']],
    lose: [[JUDGE, 'бывает. турнир длинный — давай ещё партию.']],
  },
  {
    time: 'сб 00:00', title: 'блиц при свечах', kind: 'puzzle', dark: 1, goal: 'мат в два хода в темноте',
    puzzle: ['3U5Pe', 'k4r2/pp4Q1/2p3b1/6Pp/1P3n2/P7/6KP/R7 w - - 4 36', 'g2h1 g6e4 h1g1 f4e2'],
    intro: [[KAIF, 'куранты пробили, Санта раздал подарки, свет погасили.'], [KAIF, 'ночной блиц при свечах. видно плохо, но мат видно всегда.']],
    outro: [[KAIF, 'чесс и кайф. теперь точно спать.'], [ORG, 'завтра в 11 главная партия. лагерь против оргов.']],
  },
  {
    time: 'вс 11:00', title: 'лагерь против оргов', kind: 'game', level: 2, goal: 'победи оргов',
    intro: [[ORG, 'финал смены. вы против нас, все орги на одной доске.'], [BOSS, 'мы играли эту партию весь лагерь. проигрывать не собираемся.'], [KAIF, 'кайфарики, за мной!']],
    outro: [[ORG, 'ну всё, сдаёмся. кубок смены ваш.'], [BOSS, 'увидимся весной. лист ожидания уже открыт.']],
    lose: [[BOSS, 'орги сегодня сильнее. но у тебя есть реванш — прямо сейчас.']],
  },
];

// Задача lichess: первый ход делает соперник, дальше решение. Делаем так, чтобы игрок всегда был белыми.
const flipSq = s => s[0] + (9 - +s[1]);
function flipFen(fen) {
  const [b, t, c, ep, h, m] = fen.split(' ');
  const swap = s => s.replace(/[a-zA-Z]/g, ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());
  const board = b.split('/').reverse().map(swap).join('/');
  const cast = c === '-' ? '-' : swap(c).split('').sort((x, y) => (x === x.toLowerCase()) - (y === y.toLowerCase())).join('');
  return [board, t === 'w' ? 'b' : 'w', cast, ep === '-' ? '-' : flipSq(ep), h, m].join(' ');
}
export function preparePuzzle([id, fen, moves], Chess) {
  const mv = moves.split(' ');
  const g = new Chess(fen);
  g.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
  let f = g.fen(), sol = mv.slice(1);
  if (g.turn() === 'b') { f = flipFen(f); sol = sol.map(u => flipSq(u.slice(0, 2)) + flipSq(u.slice(2, 4)) + (u[4] || '')); }
  return { id, fen: f, solution: sol };
}
