// All tuning knobs and messages in one place.
// Times are in seconds unless noted otherwise.
// Timed triggers (Claude Code, calendar, daily note, stretch) live in the
// main process and read ~/Library/Application Support/Claude Buddy/config.json.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BUDDY_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    scale: 1.45, // grid pixel size (2 grid px = 1 mascot px); body ends up 38px wide, 55px with arms

    // random appearances
    firstAppearMin: 40,
    firstAppearMax: 120,
    appearMin: 12 * 60,
    appearMax: 25 * 60,

    // stalking when the cursor is idle for a long time
    stalkIdleSec: 240,
    stalkCooldown: 20 * 60,
    stalkSpeed: 45,
    pounceRange: 150,
    pounceSpeed: 520,
    guardMaxSec: 600,

    // cursor chase
    chaseSpeed: 290,
    chaseTimeout: 14,
    catchRadius: 40,

    // napping
    napMin: 30,
    napMax: 80,

    // speech bubbles
    bubbleChance: 0.35,
    bubbleSec: 3,
    eventBubbleSec: 8,
    messages: [
      'woop.',
      'hi.',
      'i see you',
      'one thing off the list.',
      'who does what by when?',
      'say no to something today',
      'ship it',
      'good enough > perfect',
      'water. now.',
      'stretch break?',
      'you know the answer. say it.',
      'short and concrete.',
      'prio check: what is the one thing?',
      'inbox zero is a myth',
      'saving tokens? new session.',
      'no em dashes. ever.',
      'brain dump it somewhere',
      'tab hoarding again?',
      'context window full. yours.',
      'push back is allowed',
      'commit early, commit often',
      'coffee number?',
      'you are doing fine',
      'calling it a day?',
      'deep work? ok, leaving',
    ],
    // said while typing on the tiny laptop
    workMessages: ['compiling...', 'thinking...', 'tokens go brrr', 'almost done', 'one more edit'],
    // context lines for the other hobbies
    fishMessages: ['got one!', 'nope.', 'patience.', 'fish?'],
    runMessages: ['cardio.', 'gotta go fast', 'training arc', 'catch me'],
    bikeMessages: ['ring ring', 'no hands!', 'downhill!', 'nice breeze'],
    swimMessages: ['splish', 'water is fine', 'front crawl day', 'blub.'],
    readMessages: ['good chapter', 'plot twist!', 'one more page', 'no spoilers'],

    // coworking: sits down near you with the laptop and works alongside
    coworkMin: 120,
    coworkMax: 300,
    coworkChanceWhenActive: 0.3, // share of visits that become coworking while you are typing
    coworkMessages: ['same.', 'deep work, ok', 'how is it going?', 'focus.', 'busy too', 'pair programming?'],
    coworkDoneMessages: ['done. you?', 'shipped.', 'break?', 'good session', 'commit it'],

    // test mode: everything happens fast (for demos)
    testMode: false,
    testAppearMin: 6,
    testAppearMax: 15,
    testStalkIdleSec: 8,
    testStalkCooldown: 30,
  };
});
