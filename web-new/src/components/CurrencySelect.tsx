import { inputClass } from "./FormSection";
import { useTranslation } from "../i18n";

const CURRENCIES = [
  { code: "USD", flag: "\u{1F1FA}\u{1F1F8}", en: "US Dollar", zh: "美元" },
  { code: "CNY", flag: "\u{1F1E8}\u{1F1F3}", en: "Chinese Yuan", zh: "人民币" },
  { code: "EUR", flag: "\u{1F1EA}\u{1F1FA}", en: "Euro", zh: "欧元" },
  { code: "JPY", flag: "\u{1F1EF}\u{1F1F5}", en: "Japanese Yen", zh: "日元" },
  { code: "GBP", flag: "\u{1F1EC}\u{1F1E7}", en: "British Pound", zh: "英镑" },
  { code: "AUD", flag: "\u{1F1E6}\u{1F1FA}", en: "Australian Dollar", zh: "澳大利亚元" },
  { code: "CAD", flag: "\u{1F1E8}\u{1F1E6}", en: "Canadian Dollar", zh: "加拿大元" },
  { code: "CHF", flag: "\u{1F1E8}\u{1F1ED}", en: "Swiss Franc", zh: "瑞士法郎" },
  { code: "KRW", flag: "\u{1F1F0}\u{1F1F7}", en: "Korean Won", zh: "韩元" },
  { code: "SGD", flag: "\u{1F1F8}\u{1F1EC}", en: "Singapore Dollar", zh: "新加坡元" },
  { code: "HKD", flag: "\u{1F1ED}\u{1F1F0}", en: "Hong Kong Dollar", zh: "港币" },
  { code: "TWD", flag: "\u{1F1F9}\u{1F1FC}", en: "Taiwan Dollar", zh: "新台币" },
  { code: "INR", flag: "\u{1F1EE}\u{1F1F3}", en: "Indian Rupee", zh: "印度卢比" },
  { code: "RUB", flag: "\u{1F1F7}\u{1F1FA}", en: "Russian Ruble", zh: "俄罗斯卢布" },
  { code: "MYR", flag: "\u{1F1F2}\u{1F1FE}", en: "Malaysian Ringgit", zh: "马来西亚林吉特" },
  { code: "IDR", flag: "\u{1F1EE}\u{1F1E9}", en: "Indonesian Rupiah", zh: "印尼盾" },
  { code: "VND", flag: "\u{1F1FB}\u{1F1F3}", en: "Vietnamese Dong", zh: "越南盾" },
  { code: "THB", flag: "\u{1F1F9}\u{1F1ED}", en: "Thai Baht", zh: "泰铢" },
  { code: "TRY", flag: "\u{1F1F9}\u{1F1F7}", en: "Turkish Lira", zh: "土耳其里拉" },
  { code: "BRL", flag: "\u{1F1E7}\u{1F1F7}", en: "Brazilian Real", zh: "巴西雷亚尔" },
];

export default function CurrencySelect({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { locale } = useTranslation();
  const isZh = locale.startsWith("zh");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inputClass}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {isZh ? c.zh : c.en} ({c.code})
        </option>
      ))}
    </select>
  );
}

export { CURRENCIES };
