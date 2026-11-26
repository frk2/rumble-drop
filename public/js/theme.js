// The theme music file and its loop points. music/render.mjs makes the file from the score in
// music/score.js: an intro that plays once (0 to loopStart), then a loop (loopStart to loopEnd).
// `onset` is when the first kick first rises above 0.02, measured in the decoded file; a decoder
// that leaves the encoder's priming in shows it later, and the player skips the difference.
export const THEME = { url: 'audio/theme.m4a', loopStart: 12.8, loopEnd: 64, onset: 0.0068 };
