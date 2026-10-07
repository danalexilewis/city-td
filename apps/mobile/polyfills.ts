/**
 * Hermes lacks the utf-16le TextDecoder that h3-js needs.
 * Load this before any app or game-core code that imports h3-js.
 */
import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
