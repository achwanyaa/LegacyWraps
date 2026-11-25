// Pre-rendered hero slides for the homepage (rendered by `npm run renders`, served from /renders).
// film/hex are duplicated here so the hero paints instantly without waiting for the API.
export const HEROES = [
  { id: 'g63', name: 'Mercedes-AMG G 63', short: 'G 63', film: '3M Satin Dark Grey', hex: '#3b3d40', config: { model: 'mercedes-g63', zones: { body: '3m-satin-dark-grey' }, wheels: 'gloss-black', calipers: 'orange', chromeDelete: true } },
  { id: 'c63', name: 'Mercedes-AMG C 63 S', short: 'C 63', film: '3M Psychedelic Flip', hex: '#4b1f7a', config: { model: 'mercedes-c63', zones: { body: '3m-psychedelic' }, wheels: 'gloss-black', calipers: 'lime' } },
  { id: 'x6', name: 'BMW X6', short: 'X6', film: 'Inozetek Midnight Purple', hex: '#3a1a63', config: { model: 'bmw-x6', zones: { body: 'ino-midnight-purple', roof: '3m-gloss-black' }, wheels: 'gloss-black', calipers: 'red' } },
  { id: 'lc300', name: 'Toyota Land Cruiser 300', short: 'LC300', film: 'TeckWrap Matte Murram', hex: '#9c5a32', config: { model: 'toyota-lc300', zones: { body: 'teck-matte-murram', roof: '3m-matte-black' }, wheels: 'gloss-black', calipers: 'stock' } },
  { id: 'glc63', name: 'Mercedes-AMG GLC 63 S', short: 'GLC 63', film: 'Inozetek Lagoon Blue', hex: '#00a3c7', config: { model: 'mercedes-glc63', zones: { body: 'ino-miami-blue' }, stripes: 'twin', stripeFilm: 'avy-pearl-white', wheels: 'gold', calipers: 'red' } },
  { id: 'rrv', name: 'Range Rover Vogue', short: 'VOGUE', film: 'KPMF Rose Gold Chrome', hex: '#c98d7a', config: { model: 'range-rover-vogue', zones: { body: 'kpmf-rose-chrome', roof: '3m-gloss-black' }, wheels: 'gloss-black', calipers: 'stock' } },
  { id: 'atenza', name: 'Mazda Atenza', short: 'ATENZA', film: '3M Hot Rod Red', hex: '#c3131b', config: { model: 'mazda-atenza', zones: { body: '3m-racing-red' }, wheels: 'gunmetal', calipers: 'stock' } },
];
