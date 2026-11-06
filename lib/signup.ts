/** Signup form helpers (pure, tested). */

/** "Hoytes New Development" -> "hoytes-new-development". Fits the shop address rule: 2 to 41 lowercase letters, numbers and dashes. */
export function shopAddress(input: string) {
  return input.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 41).replace(/-+$/, "");
}

/** "Starlight Cinema Experiences" -> "SCE"; one word -> its first two letters. */
export function codePrefix(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return words.slice(0, 4).map((w) => w[0]).join("");
}
