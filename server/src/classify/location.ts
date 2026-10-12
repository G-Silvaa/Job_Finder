import type { Region, WorkMode } from '../types.js';
import { rx, test } from './rx.js';

const LATAM_ISO = new Set(['AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GT', 'HN', 'MX', 'NI', 'PA', 'PY', 'PE', 'PR', 'UY', 'VE', 'BR']);
const EUROPE_ISO = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
  'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'UK', 'CH', 'NO', 'IS', 'RS', 'UA', 'AL', 'BA', 'ME', 'MK', 'MD', 'EL',
]);

const BR = rx(
  [
    'brasil',
    'brazil',
    'brasileir[oa]s?',
    'brazilian',
    'sao\\s?paulo',
    'rio\\s?de\\s?janeiro',
    'minas\\s?gerais',
    'santa\\s?catarina',
    'rio\\s?grande\\s?do\\s?(?:sul|norte)',
    'pernambuco',
    'goias',
    'espirito\\s?santo',
    'distrito\\s?federal',
    'parana',
    'bahia',
    'ceara',
    'maranhao',
    'piaui',
    'alagoas',
    'sergipe',
    'paraiba',
    'mato\\s?grosso(?:\\s?do\\s?sul)?',
    'rondonia',
    'roraima',
    'tocantins',
    'amapa',
    'amazonas',
    'belo\\s?horizonte',
    'curitiba',
    'porto\\s?alegre',
    'florianopolis',
    'recife',
    '(?<!el\\s)salvador',
    'fortaleza',
    'brasilia',
    'campinas',
    'goiania',
    'manaus',
    'belem',
    'vitoria',
    'joinville',
    'blumenau',
    'uberlandia',
    'ribeirao\\s?preto',
    'sorocaba',
    'santos',
    'sao\\s?jose\\s?dos\\s?campos',
    'londrina',
    'maringa',
    'natal',
    'joao\\s?pessoa',
    'maceio',
    'aracaju',
    'teresina',
    'sao\\s?luis',
    'cuiaba',
    'campo\\s?grande',
    'barueri',
    'osasco',
    'alphaville',
    'santo\\s?andre',
    'sao\\s?bernardo(?:\\s?do\\s?campo)?',
    'sao\\s?caetano(?:\\s?do\\s?sul)?',
    'guarulhos',
    'niteroi',
    'juiz\\s?de\\s?fora',
    'contagem',
    'caxias\\s?do\\s?sul',
    'pelotas',
    'chapeco',
    'itajai',
    'balneario\\s?camboriu',
    'sao\\s?carlos',
    'jundiai',
    'piracicaba',
    'bauru',
    'indaiatuba',
    'cascavel',
    'foz\\s?do\\s?iguacu',
    'ponta\\s?grossa',
    'feira\\s?de\\s?santana',
    'vila\\s?velha',
    'anapolis',
    'palmas',
    'porto\\s?velho',
    'macapa',
    'boa\\s?vista',
    'campina\\s?grande',
    'uberaba',
    'santa\\s?rita\\s?do\\s?sapucai',
    'criciuma',
    'novo\\s?hamburgo',
    'sao\\s?leopoldo',
    'canoas',
    'braganca\\s?paulista',
  ].join('|'),
);
/** Siglas de UF sem conflito com estados dos EUA. */
const BR_UF = /(?:^|[\s,/(\-–|])(SP|RJ|MG|DF|CE|GO|PB|RN|PI|RR|AP|AC|TO|PR|RS)(?=$|[\s,/)\-–|.])/;
/** Siglas que também são estados dos EUA (AL, MA, PA, SC, MT, MS) ou países: só valem se a fonte for brasileira. */
const BR_UF_AMBIGUOUS = /(?:^|[\s,/(\-–|])(SC|BA|PE|ES|AM|MA|PA|AL|MT|MS|SE|RO)(?=$|[\s,/)\-–|.])/;

const PT = rx(
  [
    'portugal',
    'lisboa',
    'lisbon',
    'porto(?!\\s?(?:alegre|seguro|velho|nacional|belo|feliz|rico|ferreira|real))',
    'braga',
    'coimbra',
    'aveiro',
    'faro',
    'setubal',
    'leiria',
    'viseu',
    'guimaraes',
    'funchal',
    'madeira',
    'acores',
    'azores',
    'evora',
    'matosinhos',
    'oeiras',
    'sintra',
    'cascais',
    'amadora',
    'almada',
    'vila\\s?nova\\s?de\\s?gaia',
    'maia',
    'barcelos',
    'famalicao',
    'covilha',
    'castelo\\s?branco',
    'portimao',
    'loule',
    'viana\\s?do\\s?castelo',
    'vila\\s?real',
    'braganca(?!\\s?paulista)',
    'ponta\\s?delgada',
    'odivelas',
    'loures',
    'seixal',
    'carcavelos',
    'taguspark',
    'lagoas\\s?park',
  ].join('|'),
);

const US = rx(
  [
    'united\\s?states(?:\\sof\\samerica)?(?!\\s?(?:virgin|minor))',
    'usa',
    'u\\.s\\.a?\\.?',
    'us',
    'estados\\s?unidos',
    'eua',
    'north\\s?america',
    'america\\s?do\\s?norte',
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida',
    'georgia,?\\s(?:usa|us)', 'atlanta', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new\\s?hampshire', 'new\\s?jersey', 'new\\s?mexico', 'new\\s?york', 'north\\s?carolina', 'north\\s?dakota', 'ohio',
    'oklahoma', 'oregon', 'pennsylvania', 'rhode\\s?island', 'south\\s?carolina', 'south\\s?dakota', 'tennessee', 'texas',
    'utah', 'vermont', 'virginia', 'washington', 'west\\s?virginia', 'wisconsin', 'wyoming',
    'san\\s?francisco', 'sf', 'bay\\s?area', 'silicon\\s?valley', 'nyc', 'seattle', 'austin', 'boston', 'chicago',
    'los\\s?angeles', 'denver', 'miami', 'san\\s?diego', 'san\\s?jose', 'palo\\s?alto', 'mountain\\s?view', 'menlo\\s?park',
    'sunnyvale', 'redmond', 'bellevue', 'portland', 'philadelphia', 'dallas', 'houston', 'raleigh', 'durham',
    'salt\\s?lake\\s?city', 'pittsburgh', 'nashville', 'phoenix', 'detroit', 'minneapolis', 'boulder', 'brooklyn',
    'manhattan', 'santa\\s?clara', 'santa\\s?monica', 'irvine', 'oakland', 'berkeley', 'arlington', 'reston', 'columbus',
    'cincinnati', 'cleveland', 'st\\.?\\s?louis', 'kansas\\s?city', 'charlotte', 'orlando', 'tampa', 'baltimore',
    'sacramento', 'las\\s?vegas', 'scottsdale', 'plano', 'ann\\s?arbor', 'hoboken', 'jersey\\s?city', 'stamford',
    'princeton', 'san\\s?mateo', 'redwood\\s?city', 'cupertino', 'el\\s?segundo', 'culver\\s?city', 'lehi', 'provo',
  ].join('|'),
);
/** Para títulos: sem "us"/cidades, que viram falso positivo ("Join us", "Natal"). */
const US_STRICT = rx('united\\s?states|usa|u\\.s\\.a?\\.?|estados\\s?unidos|eua');
const US_UPPER = /(?<![A-Za-z])US(?![A-Za-z])/;
const BR_STRICT = rx('brasil|brazil');
const PT_STRICT = rx('portugal|lisboa|lisbon');

const US_STATE_CODE =
  /,\s*(AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MI|MN|MO|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|RI|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?![A-Za-z])/;
const US_STATE_CODE_AMBIGUOUS = /,\s*(AL|MA|PA|SC|MT|MS)(?![A-Za-z])/;

const LATAM_MULTI = rx('latam|latin\\s?america|america\\s?latina|latinoamerica|south\\s?america|america\\s?do\\s?sul|central\\s?america|lat\\s?am');
const AMERICAS = rx('americas|the\\samericas|americas\\s?only|western\\shemisphere');
const LATAM_COUNTRY = rx(
  'brazil|brasil|mexico|argentina|colombia|chile|peru|uruguay|uruguai|paraguay|paraguai|bolivia|ecuador|equador|venezuela|costa\\s?rica|panama|guatemala|dominican\\srepublic|el\\ssalvador|honduras|nicaragua|puerto\\srico',
);

const EUROPE_MULTI = rx('europe|european|europa|eu|emea|eea|european\\s?union|uniao\\s?europeia|cet|cest|eu\\s?timezones?|european\\stimezones?');
const EUROPE_COUNTRY = rx(
  'portugal|spain|espanha|france|franca|germany|alemanha|italy|italia|netherlands|holanda|paises\\sbaixos|belgium|belgica|ireland|irlanda|poland|polonia|austria|switzerland|suica|sweden|suecia|denmark|dinamarca|norway|noruega|finland|finlandia|czech(?:ia|\\srepublic)?|romania|romenia|hungary|hungria|greece|grecia|croatia|croacia|bulgaria|slovakia|slovenia|estonia|latvia|lithuania|lituania|luxembourg|uk|united\\skingdom|reino\\sunido|england|inglaterra|scotland|serbia|ukraine|ucrania|cyprus|malta',
);

const WORLDWIDE = rx(
  'worldwide|world\\s?wide|anywhere|global(?:ly)?|world|todo\\so\\smundo|qualquer\\slugar|any\\s(?:location|country|timezone|time\\szone)|international|internacional',
);

/** Lugares fora do foco (BR/PT/EUA): se a vaga cita só eles, não usamos a região padrão da fonte. */
const OTHER_PLACES = rx(
  'germany|deutschland|alemanha|berlin|munich|munchen|hamburg|frankfurt|uk|united\\skingdom|england|london|londres|manchester|edinburgh|scotland|ireland|irlanda|dublin|france|franca|paris|spain|espanha|madrid|barcelona|valencia|netherlands|holanda|amsterdam|rotterdam|belgium|brussels|italy|italia|milan|rome|switzerland|suica|zurich|geneva|austria|vienna|poland|polonia|warsaw|krakow|czech|prague|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|estonia|tallinn|romania|bucharest|greece|athens|ukraine|kyiv|turkey|istanbul|israel|tel\\saviv|canada|canadian|toronto|vancouver|montreal|ontario|quebec|british\\scolumbia|mexico|cdmx|guadalajara|argentina|buenos\\saires|colombia|bogota|medellin|chile|santiago\\sde\\schile|peru|lima|uruguay|montevideo|india|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|chennai|singapore|australia|sydney|melbourne|new\\szealand|auckland|japan|tokyo|korea|seoul|china|shanghai|beijing|hong\\skong|taiwan|taipei|philippines|manila|vietnam|indonesia|jakarta|malaysia|thailand|bangkok|uae|dubai|abu\\sdhabi|saudi|egypt|cairo|nigeria|lagos|kenya|nairobi|south\\safrica|cape\\stown|apac|asia|africa',
);

const REMOTE = rx(
  'remot[eo]s?|remota|remote[\\s-]?first|home[\\s-]?office|anywhere|teletrabalho|trabalho\\sa\\sdistancia|wfh|work\\sfrom\\shome|100%\\sremot[oe]|full[\\s-]?remote',
);
const HYBRID = rx('h[iy]brid[oa]?|hybrid');
const ONSITE = rx('presencial|alocad[oa]|on[\\s-]?site|in[\\s-]?office|office[\\s-]based|in[\\s-]person|no\\sescritorio');
const NOT_REMOTE = rx('(?:not|no|nao|sem)\\s(?:a\\s)?(?:remote|remoto|remota)|non[\\s-]remote');

/** Frases fortes na descrição que dizem o modelo de trabalho. */
const DESC_MODE: [WorkMode, RegExp][] = [
  ['hybrid', rx('(?:modelo|regime|formato|modalidade)\\s(?:de\\s(?:trabalho|contratacao|atuacao)\\s)?:?\\s?h[iy]brid[oa]|hybrid\\s(?:work|role|position|model|schedule)|modelo\\shibrido|trabalho\\shibrido')],
  [
    'remote',
    rx(
      '(?:modelo|regime|formato|modalidade)\\s(?:de\\s(?:trabalho|contratacao|atuacao)\\s)?:?\\s?(?:100%\\s)?remot[oa]|100%\\sremot[oa]|totalmente\\sremot[oa]|trabalho\\sremoto|vaga\\sremota|fully\\sremote|100%\\sremote|remote\\s(?:position|role|job|opportunity)|this\\s(?:role|position|job)\\s(?:is|can\\sbe)\\s(?:fully\\s|100%\\s)?remote|work\\s(?:fully\\s)?remotely|work\\sfrom\\sanywhere|remote[\\s-]first|home\\soffice',
    ),
  ],
  ['onsite', rx('(?:modelo|regime|formato|modalidade)\\s(?:de\\s(?:trabalho|contratacao|atuacao)\\s)?:?\\s?presencial|100%\\spresencial|trabalho\\spresencial|on[\\s-]?site\\s(?:role|position)|in[\\s-]office\\s(?:role|position)|must\\sbe\\s(?:located|based)\\s(?:in|near)')],
];

function isoRegions(countries: string[] | undefined, out: Set<Region>) {
  if (!countries?.length) return;
  const codes = new Set(countries.map((c) => c.toUpperCase()));
  for (const code of codes) if (code === 'BR' || code === 'PT' || code === 'US') out.add(code);
  // vaga aberta a vários países da região (não só um)
  if ([...codes].filter((c) => LATAM_ISO.has(c)).length >= 3) out.add('LATAM');
  if ([...codes].filter((c) => EUROPE_ISO.has(c)).length >= 3) out.add('EUROPE');
}

function countDistinct(re: RegExp, text: string): number {
  re.lastIndex = 0;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) seen.add(m[0]);
  return seen.size;
}

/**
 * Regiões a partir do texto de localização.
 * `locOriginal` mantém maiúsculas para reconhecer siglas ("Curitiba - PR", "Austin, TX").
 */
export function detectRegions(locNorm: string, locOriginal: string, brSource: boolean): Set<Region> {
  const out = new Set<Region>();
  if (!locNorm) return out;
  if (test(BR, locNorm) || BR_UF.test(locOriginal) || (brSource && BR_UF_AMBIGUOUS.test(locOriginal))) out.add('BR');
  if (test(PT, locNorm)) out.add('PT');
  if (test(US, locNorm) || usStateCode(locOriginal, locNorm, out.has('BR'))) out.add('US');
  if (test(LATAM_MULTI, locNorm)) out.add('LATAM');
  if (test(AMERICAS, locNorm)) {
    out.add('LATAM');
    out.add('US');
  }
  if (countDistinct(LATAM_COUNTRY, locNorm) >= 3) out.add('LATAM');
  if (test(EUROPE_MULTI, locNorm) || countDistinct(EUROPE_COUNTRY, locNorm) >= 3) out.add('EUROPE');
  if (test(WORLDWIDE, locNorm)) out.add('WORLDWIDE');
  return out;
}

function detectTitleRegions(titleNorm: string, titleOriginal: string): Region[] {
  const out: Region[] = [];
  if (test(BR_STRICT, titleNorm)) out.push('BR');
  if (test(PT_STRICT, titleNorm)) out.push('PT');
  if (test(US_STRICT, titleNorm) || US_UPPER.test(titleOriginal)) out.push('US');
  if (test(LATAM_MULTI, titleNorm)) out.push('LATAM');
  if (test(EUROPE_MULTI, titleNorm)) out.push('EUROPE');
  return out;
}

/**
 * ", CA" / ", TX" depois de uma cidade = estado dos EUA. Mas ", CA", ", IN", ", DE", ", AR" também são
 * códigos de país: "Kitchener, ON, CA" (Canadá), "Bengaluru, KA, IN" (Índia), "Berlin, DE".
 */
function usStateCode(locOriginal: string, locNorm: string, brFound: boolean): boolean {
  if (test(OTHER_PLACES, locNorm)) return false;
  const check = (re: RegExp) => {
    const m = re.exec(locOriginal);
    if (!m) return false;
    // "ON, CA" / "KA, IN": a sigla vem depois de outra sigla (província + país)
    return !/(?:^|[\s,(])[A-Z]{2}\s*$/.test(locOriginal.slice(0, m.index));
  };
  return check(US_STATE_CODE) || (!brFound && check(US_STATE_CODE_AMBIGUOUS));
}

export interface LocationInput {
  location?: string;
  titleOriginal: string;
  countries?: string[];
  regionHint?: Region[];
  workMode?: WorkMode;
  titleNorm: string;
  textNorm: string;
  tagsNorm: string;
}

export function classifyLocation(input: LocationInput): { regions: Region[]; workMode: WorkMode } {
  const loc = String(input.location ?? '');
  const locNorm = loc
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const brSource = !!input.regionHint?.includes('BR');

  // modelo de trabalho
  let workMode: WorkMode = input.workMode ?? 'unknown';
  if (workMode === 'unknown') {
    const head = `${locNorm} | ${input.titleNorm} | ${input.tagsNorm}`;
    if (test(REMOTE, head) && !test(NOT_REMOTE, head)) workMode = 'remote';
    else if (test(HYBRID, head)) workMode = 'hybrid';
    else if (test(ONSITE, head)) workMode = 'onsite';
  }
  if (workMode === 'unknown') {
    let bestPos = Infinity;
    for (const [mode, re] of DESC_MODE) {
      re.lastIndex = 0;
      const m = re.exec(input.textNorm);
      if (m && m.index < bestPos) {
        bestPos = m.index;
        workMode = mode;
      }
    }
  }

  // regiões
  const regions = detectRegions(locNorm, loc, brSource);
  isoRegions(input.countries, regions);
  // o título às vezes traz o país: "[Remoto] Dev Node - Portugal", "Software Engineer (LATAM)"
  if (regions.size === 0) for (const r of detectTitleRegions(input.titleNorm, input.titleOriginal)) regions.add(r);

  const specific = [...regions].filter((r) => r !== 'WORLDWIDE');
  if (specific.length > 0) regions.delete('WORLDWIDE');
  // região padrão da fonte só quando a vaga não diz que é em outro país ("Remote (Germany)", "London, UK")
  if (regions.size === 0 && input.regionHint?.length && !test(OTHER_PLACES, locNorm)) for (const r of input.regionHint) regions.add(r);
  if (
    regions.size === 0 &&
    workMode === 'remote' &&
    (!loc || test(REMOTE, locNorm)) &&
    !test(OTHER_PLACES, locNorm) &&
    !test(OTHER_PLACES, input.titleNorm)
  )
    regions.add('WORLDWIDE');

  return { regions: [...regions], workMode };
}
