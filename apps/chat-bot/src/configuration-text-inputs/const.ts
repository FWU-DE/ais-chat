// UI
export const TEXT_INPUT_FIELDS_LENGTH_LIMIT = 500;
export const TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS = 50_000;
export const CHAT_MESSAGE_LENGTH_LIMIT = 6000;
export const SMALL_TEXT_INPUT_FIELDS_LIMIT = 50;

// Web scraper
export const WEB_SCRAPE_RESULT_LENGTH_LIMIT = 6000; // Maximum total characters from a single web scrape result (~4 DIN A4 pages)

// Chat history
export const TOTAL_CHAT_LENGTH_LIMIT = 60_000; // Maximum total characters in chat history (~40 DIN A4 pages)

// RAG
export const CHUNK_SIZE = 2500; // Number of characters per chunk when splitting text for RAG. Typical sweet spot to balance context richness with retrieval relevance
export const VECTOR_SEARCH_LIMIT = 10; // Number of chunks to retrieve. One chunk is approximately 300 words or 400-500 tokens
export const RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT = 100_000; // Maximum number of characters returned when retrieving a whole attached file

// Web search
export const WEBSEARCH_RESULTS_LIMIT = 10; // Number of websearch results to include in the RAG context
export const MAX_WEB_SEARCH_INCLUDED_DOMAINS = 50; // Maximum number of domains that can be included in the web search scope
export const WEBSEARCH_RESULT_LENGTH_LIMIT = 2500; // Maximum characters to include from each websearch result

// MUNDO search
export const MUNDO_SEARCH_ENDPOINT = 'https://mundo.schule/api/search';
export const MUNDO_SEARCH_RESULTS_LIMIT = 10; // Number of MUNDO media results returned to the model
export const MUNDO_SEARCH_QUERY_LENGTH_LIMIT = 200; // Maximum characters allowed in a MUNDO search query
export const MUNDO_SEARCH_TITLE_LENGTH_LIMIT = 200; // Maximum characters kept from each MUNDO result title
export const MUNDO_SEARCH_DESCRIPTION_LENGTH_LIMIT = 800; // Maximum characters kept from each MUNDO result description
export const MUNDO_SEARCH_TIMEOUT_MS = 10_000; // Request timeout for the MUNDO search API
export const MUNDO_DETAILS_URL_PREFIX = 'https://mundo.schule/details/';
export const MUNDO_CLASS_LEVELS = ['1-4', '5-10', '11-13'] as const;
export const MUNDO_SUBJECTS = [
  'Deutsch',
  'Deutsch als Zweitsprache',
  'Englisch',
  'Französisch',
  'Griechisch',
  'Italienisch',
  'Latein',
  'Russisch',
  'Spanisch',
  'Türkisch',
  'Biologie',
  'Chemie',
  'Informatik/ITB',
  'Mathematik',
  'Physik',
  'Sachunterricht',
  'Sexualerziehung',
  'Umwelt',
  'Geografie',
  'Geschichte',
  'Politische Bildung',
  'Wirtschaftskunde',
  'Bildende Kunst',
  'Musik',
  'Ethik',
  'Philosophie',
  'Religion',
  'Sport',
  'Arbeitslehre',
  'Gesundheit',
  'Interkulturelle Bildung',
  'Medienpädagogik',
  'Pädagogik',
  'Psychologie',
  'Sucht und Prävention',
  'Verkehrserziehung',
] as const;

// Attachments
export const NUMBER_OF_FILES_LIMIT = 20; // Maximum number of files that can be attached to a chat
export const NUMBER_OF_IMAGES_LIMIT = 5;
export const NUMBER_OF_FILES_LIMIT_FOR_SHARED_CHAT = 5; // Maximum number of files that can be attached to a shared chat
export const IMAGE_GENERATION_INPUT_LIMIT = 4; // Maximum number of input images for image generation
export const NUMBER_OF_LINKS_LIMIT_FOR_SHARED_CHAT = 5; // Maximum number of links that can be attached to a shared chat

// Example prompts
export const NUMBER_OF_EXAMPLE_PROMPTS_LIMIT = 10; // Maximum number of example prompts that can be added to an assistant
export const EXAMPLE_PROMPT_LENGTH_LIMIT = 500; // Maximum length of an example prompt in characters
