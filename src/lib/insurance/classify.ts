/**
 * 신상품 기사에서 상품 유형을 추출하는 키워드 분류기 (한/중/일/영).
 * "어떤 신상품인지"를 태그로 한눈에 보여주기 위한 용도라
 * 재현율보다 정밀도를 우선한다 — 애매하면 태그를 붙이지 않는다.
 */

const TAG_RULES: { tag: string; re: RegExp }[] = [
  { tag: "암", re: /암보험|암 ?진단|재발암|유사암|がん保険|がん|癌症|防癌|重疾|重大疾病|cancer|critical illness/i },
  { tag: "건강·의료", re: /건강보험|의료보험|실손|의료비|健康増進|医療保険|医疗险|健康险|百万医疗|health insurance|medical insurance/i },
  { tag: "사망·종신", re: /종신보험|정기보험|사망보장|終身保険|定期保険|寿险|终身寿险|whole life|term life/i },
  { tag: "연금·저축", re: /연금보험|저축보험|변액|個人年金|年金保険|養老|养老|年金险|分红险|annuity|savings insurance/i },
  { tag: "간병·치매", re: /간병|치매|장기요양|介護保険|認知症|护理险|长期护理|long[- ]?term care|dementia/i },
  { tag: "어린이·태아", re: /어린이보험|자녀보험|태아보험|학자금|こども保険|学資保険|少儿险|儿童保险|child insurance/i },
  { tag: "펫", re: /펫보험|반려동물|ペット保険|宠物险|pet insurance/i },
  { tag: "여행", re: /여행자보험|여행보험|旅行保険|旅平险|旅游险|travel insurance/i },
  { tag: "자동차·운전자", re: /자동차보험|운전자보험|自動車保険|车险|auto insurance|motor insurance/i },
  { tag: "상해·재해", re: /상해보험|재해보장|傷害保険|意外险|accident insurance|personal accident/i },
  { tag: "기업·사이버", re: /기업보험|배상책임|사이버보험|휴업손실|サイバー保険|企业险|网络安全险|cyber insurance|liability insurance/i },
  { tag: "임베디드·파라메트릭", re: /임베디드|파라메트릭|지수형|パラメトリック|組込型|指数保险|embedded|parametric/i },
];

const MAX_TAGS = 3;

export function productTags(text: string): string[] | undefined {
  const tags: string[] = [];
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) {
      tags.push(rule.tag);
      if (tags.length >= MAX_TAGS) break;
    }
  }
  return tags.length ? tags : undefined;
}
