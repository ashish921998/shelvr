# Apple W-8BEN for an individual developer resident in India

Research date: 21 August 2026

This note addresses an Indian tax resident enrolled in the Apple Developer Program as an **individual**, earning ordinary App Store and in-app subscription proceeds, doing the development work in India, and having no U.S. office, employees, fixed place of business, or other U.S. permanent establishment. It is research, not individualized legal or tax advice.

## Bottom line

The best-supported treatment is:

1. Complete **Form W-8BEN** to certify foreign individual status.
2. Enter the developer's **PAN** as the foreign TIN.
3. For ordinary App Store proceeds, **do not claim treaty benefits unless Apple specifically requires a claim**. In Apple's flow, that means answer **No** to a treaty-benefits question or leave the treaty-claim section blank.
4. Do **not** enter Article 12 / 15% merely because the app or subscription is described as a license.

If the current App Store Connect form unexpectedly forces an article, rate, and explanation, stop before submission and ask Apple Finance to confirm why. If a treaty claim truly is required and the facts above are accurate, **Article 7(1), business profits, 0%** is materially more supportable than Article 12 royalties, but it is a fallback position rather than the normal way to certify foreign status for standard App Store proceeds.

## Field-by-field recommendation

| App Store Connect / W-8BEN field | Entry | Basis |
|---|---|---|
| Form | W-8BEN | The IRS uses W-8BEN for a non-U.S. individual; foreign entities use W-8BEN-E. [IRS W-8BEN instructions](https://www.irs.gov/instructions/iw8ben) |
| Legal name | The individual's legal name, matching Apple and PAN records | The beneficial owner completes the form in their own name. [IRS W-8BEN instructions, line 1](https://www.irs.gov/instructions/iw8ben) |
| Country of citizenship | India, if factually correct | Citizenship and treaty residence are distinct fields. [IRS W-8BEN instructions, line 2](https://www.irs.gov/instructions/iw8ben) |
| Permanent residence | Actual Indian tax-residence address | The IRS requires the address in the country where treaty residence is claimed. [IRS W-8BEN instructions, line 3](https://www.irs.gov/instructions/iw8ben) |
| U.S. SSN / ITIN | Blank if the developer genuinely has neither | A foreign TIN may be used for a treaty claim instead of a U.S. TIN. Never invent an ITIN. [IRS W-8BEN instructions, lines 5 and 6a](https://www.irs.gov/instructions/iw8ben) |
| Foreign TIN | PAN, without substituting GSTIN or Aadhaar | India's Income Tax Department describes PAN as its unique taxpayer identifier; the OECD's India TIN profile expressly identifies PAN as India's TIN. [India Income Tax Department](https://www.incometaxindia.gov.in/w/pan-and-aadhaar), [OECD India TIN profile](https://www.oecd.org/tax/automatic-exchange/crs-implementation-and-assistance/tax-identification-numbers/india-tin.pdf) |
| Date of birth | Actual DOB in the format Apple requests | [IRS W-8BEN instructions, line 8](https://www.irs.gov/instructions/iw8ben) |
| Claim tax treaty benefits? | **No / leave Part II blank** for ordinary App Store proceeds | A W-8BEN must be supplied when requested even without a treaty claim. [IRS W-8BEN instructions](https://www.irs.gov/instructions/iw8ben) |
| Treaty country | Blank when no treaty claim is made | Not applicable without a treaty claim. |
| Treaty article / paragraph | Blank when no treaty claim is made | Not applicable without a treaty claim. |
| Type of income | If Apple separately requires an income-type selection, choose its ordinary **Income from the sale of applications** option; this does not by itself mean a treaty claim is being made | Apple's contract and U.S. regulations treat the platform relationship as sales/agency, not a royalty paid by Apple. See analysis below. |
| Withholding rate | Blank when no treaty claim is made | Not applicable without a treaty claim. |
| Additional-conditions explanation | Blank when no treaty claim is made | Not applicable without a treaty claim. |

Do not check “FTIN not legally required” when a valid PAN exists.

## Why this is not normally Article 12 royalty income

Apple's Paid Applications Agreement is structurally a principal-agent agreement. The developer appoints Apple as agent or commissionaire to market and deliver the app to end users, Apple acts “for You and on Your behalf,” and the developer remains the principal. Apple also says no royalty is payable for the rights it needs to market and deliver the app. [Apple Paid Applications Agreement, Schedule 2 §§1.1–1.3](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf)

Current U.S. Treasury regulations contain an unusually close match to the App Store model. Example 20 in 26 CFR §1.861-18 describes an internet platform that:

- acts as agent for mobile-application developers;
- hosts apps and lets customers download them;
- receives only the rights needed to make and distribute copies as agent;
- keeps a fixed percentage and remits the balance to the developer.

The regulation concludes that the developer-platform transaction's predominant character is platform and agency services, **not** a transfer of copyright rights. It separately treats the developer-to-customer transfer as a copyrighted-article transaction, not a royalty for copyright exploitation. [IRS, T.D. 10022, Example 20](https://www.irs.gov/irb/2025-08_IRB)

That distinction matters. The U.S.–India treaty's Article 12 applies when payment is consideration for the use of, or right to use, a copyright or another listed intellectual-property right. If income truly is a qualifying Article 12(3)(a) royalty, the present treaty ceiling is 15% under Article 12(2)(a)(ii). But the App Store's agency/sales structure and the Treasury's direct platform example do not characterize the ordinary developer proceeds that way. [U.S.–India income-tax treaty, Article 12](https://www.irs.gov/pub/irs-trty/india.pdf)

Shelvr sells recurring access with hosted functionality rather than a bare assignment of commercial copyright rights. Current U.S. regulations classify on-demand access to software, digital content, or similar resources as a cloud transaction and treat cloud transactions as services. The ultimate characterization is fact-specific, but this is additional evidence against treating an ordinary app subscription as an Article 12 copyright royalty. [26 CFR §1.861-19](https://www.law.cornell.edu/cfr/text/26/1.861-19)

## Why a treaty claim is normally unnecessary

The IRS says a payer can request W-8BEN to document foreign status **whether or not** the individual claims a reduced treaty rate. It also says chapter 3 withholding generally applies to U.S.-source FDAP income such as royalties, while most gains from sales of property are excluded. [IRS W-8BEN instructions](https://www.irs.gov/instructions/iw8ben)

Apple's public help requires all developers to provide a U.S. tax form, but it does not instruct all non-U.S. developers to claim a treaty rate. It warns that submitted information may not be editable without contacting Apple. [Apple: Provide tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information)

A 2020 Apple Developer Forum post reproduces an Apple Finance Support response stating that App Store contracts are sales/commission rather than royalty agreements, non-U.S. application sales were not subject to U.S. withholding under Apple's model, and the treaty-benefits section was not required merely to certify foreign status. This is a user-posted copy of an email and concerns W-8BEN-E, so it is not formal authority; however, it is consistent with the current Apple agreement and the now-effective Treasury platform-agent example. [Apple Developer Forums thread](https://developer.apple.com/forums/thread/660025)

## Article 7 fallback if Apple actually requires a treaty claim

If Apple Finance confirms that the current flow requires a treaty claim for these proceeds, and the developer is an Indian treaty resident with no U.S. permanent establishment, the defensible fallback entries are:

| Field | Fallback entry |
|---|---|
| Treaty country | India |
| Article and paragraph | Article 7(1) |
| Rate | 0% |
| Type | Income from the sale of applications |
| Explanation | `The beneficial owner is a resident of India and derives business profits from the sale of applications that are not attributable to a permanent establishment in the United States.` |

Article 7(1) permits the United States to tax an Indian enterprise's business profits only when the enterprise carries on business through a U.S. permanent establishment, and only to the extent attributable to that establishment. The IRS instructions specifically say an Article 7 claimant should state that the business profits are not attributable to a permanent establishment. [U.S.–India treaty, Article 7](https://www.irs.gov/pub/irs-trty/india.pdf), [IRS W-8BEN instructions, line 10](https://www.irs.gov/instructions/iw8ben)

This fallback depends on facts. Apple's non-exclusive role serving many developers resembles an independent commission agent, but whether any person or arrangement creates a U.S. permanent establishment is a legal conclusion. A developer with U.S. personnel, an office, a fixed place of business, or other U.S. operations should not use the fallback language without professional review.

## Internet and Reddit scan

The forum evidence is not concrete enough to override the primary sources:

- Recent India-focused Reddit threads contain conflicting one-line answers: one suggests Article 12 / 15%, while another says Article 7 / 0%. They do not provide a 1042-S, Apple withholding report, Apple Finance response, or professional analysis. [Example Reddit thread](https://www.reddit.com/r/appledevelopers/comments/1vnhdn1/what_needs_to_be_entered_in_the_w8ben_line_10/)
- Another recent thread asks the exact Article 7-versus-Article 12 question but supplies no verified payout evidence. [Example Reddit thread](https://www.reddit.com/r/TaxPlanning_India/comments/1ugt7ha/app_store_india_article_7_0_or_12_15_on_w8ben/)
- The useful Apple Developer Forum item is still secondhand, but its reproduced Apple Finance response aligns with the Apple agreement and the exact Treasury regulation. [Apple Developer Forums](https://developer.apple.com/forums/thread/660025)

Accordingly, Reddit does not support a confident Article 12 choice. The primary-source chain supports foreign-status certification without a treaty claim, with Article 7 as the fallback if a claim is genuinely required.

## What remains unproven

- Apple does not publish an India-specific, field-by-field W-8BEN ruling for individual developers.
- The App Store Connect substitute form and required fields can change, and the binding agreement is the version accepted in the account.
- Treasury Example 20 assumes a perpetual app download. Shelvr's auto-renewing subscription adds hosted/service elements; those reinforce a non-royalty characterization but make the exact income classification fact-specific.
- Neither Reddit nor public Apple materials establish what withholding Apple applied to a verified Indian individual's recent 1042-S.
- This research does not decide Indian income-tax, GST, LUT, foreign-tax-credit, or FEMA/banking obligations.

Because Apple warns that tax forms may be difficult to correct after submission, an unexpected forced treaty field is a reason to pause and contact Apple Finance—not a reason to guess Article 12.
