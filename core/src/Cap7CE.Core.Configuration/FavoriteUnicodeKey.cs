using System.Globalization;
using System.Text;

namespace Cap7CE.Core.Configuration;

// Preserve ECMAScript's locale-independent full lowercase, including final sigma.
internal static class FavoriteUnicodeKey
{
    public static string Create(string value)
    {
        var runes = value.EnumerateRunes().ToArray(); var result = new StringBuilder();
        for (var index = 0; index < runes.Length; index++)
        {
            var rune = runes[index];
            if (rune.Value == 0x130) result.Append("i\u0307");
            else if (rune.Value == 0x3a3 && Cased(runes, index, -1) && !Cased(runes, index, 1)) result.Append('\u03c2');
            else result.Append(Rune.ToLowerInvariant(rune).ToString());
        }
        return result.ToString();
    }
    private static bool Cased(Rune[] runes, int start, int step)
    {
        for (var index = start + step; index >= 0 && index < runes.Length; index += step)
        {
            var rune = runes[index]; var category = Rune.GetUnicodeCategory(rune);
            if (category is UnicodeCategory.NonSpacingMark or UnicodeCategory.EnclosingMark or UnicodeCategory.Format
                or UnicodeCategory.ModifierLetter or UnicodeCategory.ModifierSymbol
                || rune.Value is 0x27 or 0x2e or 0x3a or 0xb7 or 0x387 or 0x5f4 or 0x2018 or 0x2019 or 0x2024 or 0x2027 or 0xfe13 or 0xfe52 or 0xfe55 or 0xff07 or 0xff0e or 0xff1a) continue;
            return category is UnicodeCategory.UppercaseLetter or UnicodeCategory.LowercaseLetter or UnicodeCategory.TitlecaseLetter;
        }
        return false;
    }
}
