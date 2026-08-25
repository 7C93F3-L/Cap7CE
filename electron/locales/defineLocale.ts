import type { ChineseLocale, TranslationKey } from "../localization";

type PlaceholderNames<Value extends string> = Value extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never;

type HasSamePlaceholders<Source extends string, Target extends string> =
  Exclude<PlaceholderNames<Source>, PlaceholderNames<Target>> extends never
    ? Exclude<PlaceholderNames<Target>, PlaceholderNames<Source>> extends never
      ? true
      : false
    : false;

type ValidatedLocale<Locale extends Record<TranslationKey, string>> = {
  [Key in TranslationKey]: HasSamePlaceholders<ChineseLocale[Key], Locale[Key]> extends true
    ? Locale[Key]
    : never;
};

export const defineLocale = <const Locale extends Record<TranslationKey, string>>(
  locale: Locale & ValidatedLocale<Locale>
): Locale => locale;
