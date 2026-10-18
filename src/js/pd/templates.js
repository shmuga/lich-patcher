// Starter patches. All Heavy-compatible; knobs use the OwlProgram `@raw` convention
// (`r Name @raw A min max default`).

const pd = lines => "#N canvas 0 50 640 420 12;\n" + lines.map(l => l + ";").join("\n") + "\n";

export const TEMPLATES = [
  {
    name: "Passthrough",
    hint: "in → out, a blank start",
    pd: pd([
      "#X obj 40 40 adc~",
      "#X obj 40 160 dac~",
      "#X text 140 40 audio in L R",
      "#X text 140 160 audio out L R",
      "#X connect 0 0 1 0",
      "#X connect 0 1 1 1",
    ]),
  },
  {
    name: "Sine VCO",
    hint: "A pitch, B level",
    pd: pd([
      "#X obj 40 30 r Pitch @raw A 36 84 60",
      "#X obj 40 70 mtof",
      "#X obj 40 110 osc~",
      "#X obj 240 30 r Level @raw B 0 1 0.5",
      "#X msg 240 70 \\$1 20",
      "#X obj 240 110 line~",
      "#X obj 40 160 *~",
      "#X obj 40 210 dac~",
      "#X text 240 160 knobs send 0..1 - the numbers after @raw A set min max default",
      "#X connect 0 0 1 0",
      "#X connect 1 0 2 0",
      "#X connect 3 0 4 0",
      "#X connect 4 0 5 0",
      "#X connect 2 0 6 0",
      "#X connect 5 0 6 1",
      "#X connect 6 0 7 0",
      "#X connect 6 0 7 1",
    ]),
  },
  {
    name: "Delay",
    hint: "A time, B feedback, C mix",
    pd: pd([
      "#X obj 40 30 adc~",                              // 0
      "#X obj 240 30 r Time @raw A 10 1000 300",         // 1
      "#X obj 420 30 r Feedback @raw B 0 0.95 0.4",      // 2
      "#X obj 40 330 r Mix @raw C 0 1 0.5",              // 3
      "#X msg 240 70 \\$1 50",                          // 4
      "#X obj 240 110 line~",                           // 5
      "#X obj 240 150 vd~ dly",                         // 6
      "#X obj 240 200 *~",                              // 7
      "#X msg 420 70 \\$1 50",                          // 8
      "#X obj 420 110 line~",                           // 9
      "#X obj 40 200 +~",                               // 10
      "#X obj 40 250 delwrite~ dly 2000",               // 11
      "#X obj 240 390 *~",                              // 12
      "#X msg 40 360 \\$1 50",                          // 13
      "#X obj 40 390 line~",                            // 14
      "#X obj 240 440 +~",                              // 15
      "#X obj 240 480 dac~",                            // 16
      "#X connect 1 0 4 0", "#X connect 4 0 5 0", "#X connect 5 0 6 0",
      "#X connect 6 0 7 0", "#X connect 2 0 8 0", "#X connect 8 0 9 0", "#X connect 9 0 7 1",
      "#X connect 0 0 10 0", "#X connect 7 0 10 1", "#X connect 10 0 11 0",
      "#X connect 6 0 12 0", "#X connect 3 0 13 0", "#X connect 13 0 14 0", "#X connect 14 0 12 1",
      "#X connect 0 0 15 0", "#X connect 12 0 15 1", "#X connect 15 0 16 0", "#X connect 15 0 16 1",
    ]),
  },
  {
    name: "Filter",
    hint: "A cutoff, B resonance",
    pd: pd([
      "#X obj 40 30 adc~",
      "#X obj 200 30 r Cutoff @raw A 30 120 80",
      "#X obj 200 70 mtof",
      "#X msg 200 110 \\$1 30",
      "#X obj 200 150 line~",
      "#X obj 380 30 r Q @raw B 0.5 20 2",
      "#X obj 40 200 vcf~",
      "#X obj 40 250 dac~",
      "#X text 300 200 vcf~ right outlet is the lowpass",
      "#X connect 1 0 2 0", "#X connect 2 0 3 0", "#X connect 3 0 4 0",
      "#X connect 0 0 6 0", "#X connect 4 0 6 1", "#X connect 5 0 6 2",
      "#X connect 6 1 7 0", "#X connect 6 1 7 1",
    ]),
  },
  {
    name: "LFO → CV",
    hint: "A rate, out on F (CV out 1)",
    pd: pd([
      "#X obj 40 30 r Rate @raw A 0.05 10 1",
      "#X obj 40 70 osc~",
      "#X obj 200 30 loadbang",
      "#X obj 200 70 metro 5",
      "#X obj 40 120 snapshot~",
      "#X obj 40 160 * 0.5",
      "#X obj 40 200 + 0.5",
      "#X obj 40 240 s LFO @raw F",
      "#X text 200 240 F and G are the CV outputs",
      "#X connect 0 0 1 0", "#X connect 1 0 4 0", "#X connect 2 0 3 0", "#X connect 3 0 4 0",
      "#X connect 4 0 5 0", "#X connect 5 0 6 0", "#X connect 6 0 7 0",
    ]),
  },
];
