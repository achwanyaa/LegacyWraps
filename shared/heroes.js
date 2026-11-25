// Pre-rendered hero slides for the homepage (rendered by `npm run renders`, served from /renders).
// film/hex are duplicated here so the hero paints instantly without waiting for the API.
export const HEROES = [
  { id: 'g63', name: 'Mercedes-AMG G 63', short: 'G 63', film: '3M Satin Dark Grey', hex: '#3b3d40', config: { model: 'mercedes-g63', zones: { body: '3m-satin-dark-grey' }, wheels: 'gloss-black', chromeDelete: true } },
  { id: 'gle63', name: 'Mercedes-AMG GLE 63 S Coupé', short: 'GLE 63', film: '3M Psychedelic Flip', hex: '#4b1f7a', config: { model: 'mercedes-gle-coupe', zones: { body: '3m-psychedelic' }, wheels: 'gloss-black' } },
  { id: 'prado', name: 'Toyota Land Cruiser Prado', short: 'PRADO', film: 'TeckWrap Matte Murram', hex: '#9c5a32', config: { model: 'toyota-prado', zones: { body: 'teck-matte-murram', roof: '3m-gloss-black' }, wheels: 'gloss-black' } },
  { id: 'rrs', name: 'Range Rover Sport', short: 'RR SPORT', film: 'KPMF Rose Gold Chrome', hex: '#c98d7a', config: { model: 'range-rover-sport', zones: { body: 'kpmf-rose-chrome', hood: '3m-carbon' } } },
  { id: 'cx5', name: 'Mazda CX-5', short: 'CX-5', film: 'Inozetek Midnight Purple', hex: '#3a1a63', config: { model: 'mazda-cx5', zones: { body: 'ino-midnight-purple' } } },
  { id: 'atenza', name: 'Mazda Atenza', short: 'ATENZA', film: 'Inozetek Lagoon Blue', hex: '#00a3c7', config: { model: 'mazda-atenza', zones: { body: 'ino-miami-blue' } } },
];
