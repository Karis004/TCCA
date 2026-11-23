const stockPhrases = /这(?:说明|表明|意味着|反映出)|由此可见|可以看出|值得注意|不(?:等于|代表|意味着)|总体(?:来看|而言)|而非/;
const forcedContrast = /(?:不是|并非|不只是|不像|与其)[^。！？\n]{0,72}(?:而是|而在于|更像|不如)/;
const closedPeriodPhrases = /月底|月末|整月|整个月|全月|季末|年底|年末|全年/;
const sustainedHabitPhrases = /半年|(?:连续|持续|坚持)[^。！？]{0,20}(?:个月|月来|月了|多年|数年)/;
const threeItemList = /、[^，。！？；、]{1,16}(?:和|以及|还有)[^，。！？；、]/;

export function hasReportBoilerplate(text: string) {
  return stockPhrases.test(text) || forcedContrast.test(text);
}

export function isBriefReportInsight(text: string, { partialPeriod = false, establishedHabit = false, depth = "monthly" }: {
  partialPeriod?: boolean;
  establishedHabit?: boolean;
  depth?: "brief" | "monthly" | "alternative";
} = {}) {
  const numericReferences = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const listSeparators = text.match(/、/g) ?? [];
  const alternative = depth === "alternative";
  const hasContext = depth === "monthly" && text.split(/[。！？]/).filter(sentence => sentence.trim().length >= 10).length > 1;
  return text.length <= (alternative ? 140 : depth === "brief" ? 56 : 105)
    && numericReferences.length <= (alternative ? 3 : depth === "brief" ? 1 : 2)
    && listSeparators.length <= (alternative ? 2 : 1)
    && (alternative || hasContext || !threeItemList.test(text))
    && !hasReportBoilerplate(text)
    && (!partialPeriod || !closedPeriodPhrases.test(text))
    && (establishedHabit || !sustainedHabitPhrases.test(text));
}
