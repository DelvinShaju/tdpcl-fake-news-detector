/**
 * TruthLens - Front-end Advisory Fact-Checking Client
 * Vanilla JavaScript (ES2020) without frameworks or external libraries.
 */
(() => {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS AND CONFIGURATION
     ========================================================================== */

  /**
   * Mock Mode Flag
   * Set to true to test UI states offline with sample responses.
   * Set to false for live backend API integration.
   */
  const USE_MOCK = true;

  /**
   * Sample Mock Result
   * Easy to edit to test all verdicts ("suspicious" | "needs_verification" | "likely_legitimate"),
   * categories ("misinformation" | "scam" | "spam" | "none"),
   * languages ("en" | "hi" | "kn" | "other"),
   * and extracted_text (string or null).
   */
  const MOCK_RESULT = {
    verdict: 'suspicious',
    category: 'scam',
    confidence: 'high',
    language: 'en',
    indicators: [
      'Promises a prize you did not enter for',
      'Asks you to pay a fee to claim it',
      "Creates urgency: 'within 24 hours'"
    ],
    explanation:
      'This message shows common signs of a lottery scam. Do not pay or share any details. Real companies do not ask for fees to release prizes.',
    extracted_text: null
  };

  const API_ENDPOINTS = {
    TEXT: '/api/analyze-text',
    IMAGE: '/api/analyze-image'
  };

  const LIMITS = {
    MAX_TEXT_LENGTH: 5000,
    MAX_FILE_BYTES: 5 * 1024 * 1024, // 5 MB
    REQUEST_TIMEOUT_MS: 45000,
    LOADING_REASSURANCE_MS: 8000
  };

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ALLOWED_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

  /* ==========================================================================
     2. INTERNATIONALIZATION (I18N) TABLES
     ========================================================================== */

  const I18N = {
    en: {
      skipToContent: 'Skip to main content',
      tagline: 'Check suspicious forwards, posts and SMS messages before sharing.',
      privacyNotice: 'Your message is checked and not saved.',
      langAriaLabel: 'Language selection',

      // Tabs
      tabText: 'Paste text',
      tabImage: 'Upload screenshot',

      // Text Input Mode
      textLabel: 'Suspicious message text',
      textPlaceholder: 'Paste the WhatsApp forward, SMS, or social media post here…',
      charCountTemplate: '{current} / 5,000',
      checkTextBtn: 'Check text',
      thresholdAnnounce: '{current} of {max} characters used',

      // Image Input Mode
      imageLabel: 'Upload screenshot of message',
      dropPrompt: 'Choose an image, drag & drop, or paste from clipboard',
      dropHint: 'Supports JPG, PNG, WEBP up to 5 MB',
      browseBtn: 'Browse files',
      removeImage: 'Remove',
      checkImageBtn: 'Check screenshot',
      fileSizePrefix: 'Size: ',

      // Loading Messages
      loadingInitial: 'Checking…',
      loadingLong: 'Screenshots can take a few seconds…',

      // Verdict Headings
      likely_legitimate: 'Likely Legitimate',
      needs_verification: 'Needs Verification',
      suspicious: 'Suspicious',

      // Categories
      categoryPrefix: 'Issue detected: ',
      misinformation: 'Misinformation',
      scam: 'Scam / Fraud',
      spam: 'Unsolicited Spam',
      none: 'None',

      // Confidence Levels
      confidenceLabel: 'Assessment confidence:',
      confidence_low: 'Low confidence',
      confidence_medium: 'Medium confidence',
      confidence_high: 'High confidence',

      // Indicators
      indicatorsHeading: 'Warning signs found',
      noIndicators: 'No specific warning signs found in this message.',

      // Extracted Text
      extractedTextHeading: 'Text we read from your image',
      extractedTextSub: 'Check this matches your screenshot',

      // Next Steps Tips
      nextStepsHeading: 'What you can do next',
      tips: {
        suspicious: [
          'Do not forward or share this message with others.',
          'Never send money, OTP, bank details, or personal passwords.',
          'Block or report the sender if they are unfamiliar or pressuring you.'
        ],
        needs_verification: [
          'Check official websites or trusted news outlets before trusting this.',
          'Search for key phrases in the message to see if fact-checkers debunked it.',
          'Avoid sharing until the facts are independently verified.'
        ],
        likely_legitimate: [
          'The message does not show obvious red flags, but always stay cautious.',
          'Verify any links or requests directly through official channels.',
          'If sharing, ensure the context is accurate and up to date.'
        ]
      },

      // Disclaimer & Actions
      disclaimer: 'This is an AI assessment, not a final verdict. Check official sources before forwarding.',
      checkAnotherBtn: 'Check another message',

      // Error UI
      errorHeading: 'Unable to complete check',
      tryAgainBtn: 'Try again',

      // Error Codes
      EMPTY_INPUT: 'Please paste a message or choose a screenshot first.',
      TEXT_TOO_LONG: 'That message is too long. Paste up to 5,000 characters.',
      BAD_FILE_TYPE: 'Please upload a JPG, PNG or WEBP image.',
      FILE_TOO_LARGE: 'That image is too large. Please use one under 5 MB.',
      NO_TEXT_FOUND: "We couldn't find any text in that image.",
      RATE_LIMITED: 'Too many checks at once. Please wait a minute and try again.',
      AI_FAILED: 'Something went wrong while checking. Please try again.'
    },

    hi: {
      skipToContent: 'मुख्य सामग्री पर जाएँ',
      tagline: 'संदेश आगे भेजने से पहले उसकी सच्चाई जाँचें।',
      privacyNotice: 'आपका संदेश केवल जाँचा जाता है, सहेजा नहीं जाता।',
      langAriaLabel: 'भाषा चयन',

      // Tabs
      tabText: 'टेक्स्ट चिपकाएँ',
      tabImage: 'स्क्रीनशॉट अपलोड करें',

      // Text Input Mode
      textLabel: 'संदिग्ध संदेश का टेक्स्ट',
      textPlaceholder: 'यहाँ व्हाट्सएप फॉरवर्ड, एसएमएस या सोशल मीडिया पोस्ट चिपकाएँ…',
      charCountTemplate: '{current} / 5,000',
      checkTextBtn: 'टेक्स्ट जाँचें',
      thresholdAnnounce: '5,000 में से {current} अक्षर प्रयुक्त',

      // Image Input Mode
      imageLabel: 'संदेश का स्क्रीनशॉट अपलोड करें',
      dropPrompt: 'फ़ोटो चुनें, यहाँ खींचकर लाएँ, या क्लिपबोर्ड से चिपकाएँ',
      dropHint: 'JPG, PNG, WEBP समर्थित (अधिकतम 5 MB)',
      browseBtn: 'फ़ाइल चुनें',
      removeImage: 'हटाएँ',
      checkImageBtn: 'स्क्रीनशॉट जाँचें',
      fileSizePrefix: 'आकार: ',

      // Loading Messages
      loadingInitial: 'जाँच रहे हैं…',
      loadingLong: 'स्क्रीनशॉट की जाँच में कुछ सेकंड लग सकते हैं…',

      // Verdict Headings
      likely_legitimate: 'संभवतः सही संदेश',
      needs_verification: 'पुष्टि की आवश्यकता है',
      suspicious: 'संदिग्ध संदेश',

      // Categories
      categoryPrefix: 'समस्या का प्रकार: ',
      misinformation: 'गलत या भ्रामक जानकारी',
      scam: 'धोखाधड़ी (स्कैम)',
      spam: 'स्पैम संदेश',
      none: 'कोई नहीं',

      // Confidence Levels
      confidenceLabel: 'विश्वास स्तर:',
      confidence_low: 'कम',
      confidence_medium: 'मध्यम',
      confidence_high: 'उच्च',

      // Indicators
      indicatorsHeading: 'मिले हुए चेतावनी संकेत',
      noIndicators: 'इस संदेश में कोई विशिष्ट चेतावनी संकेत नहीं मिले।',

      // Extracted Text
      extractedTextHeading: 'स्क्रीनशॉट से पढ़ा गया टेक्स्ट',
      extractedTextSub: 'जाँच लें कि यह आपके स्क्रीनशॉट से मेल खाता है',

      // Next Steps Tips
      nextStepsHeading: 'आगे क्या करें',
      tips: {
        suspicious: [
          'इस संदेश को दूसरों को फॉरवर्ड या शेयर न करें।',
          'पैसे, ओटीपी (OTP), बैंक विवरण या पासवर्ड कभी न साझा करें।',
          'यदि भेजने वाला अज्ञात है या दबाव बना रहा है, तो उसे ब्लॉक करें।'
        ],
        needs_verification: [
          'विश्वास करने से पहले आधिकारिक वेबसाइट या विश्वसनीय समाचार देखें।',
          'संदेश के मुख्य शब्दों को खोजकर देखें कि क्या किसी फ़ैक्ट-चेकर ने इसकी पड़ताल की है।',
          'जब तक सच्चाई की पुष्टि न हो जाए, इसे आगे साझा करने से बचें।'
        ],
        likely_legitimate: [
          'इस संदेश में सामान्य खतरे के संकेत नहीं दिखे, फिर भी सतर्क रहें।',
          'किसी भी लिंक या वित्तीय अनुरोध को सीधे आधिकारिक स्रोत से सत्यापित करें।',
          'यदि शेयर कर रहे हैं, तो सुनिश्चित करें कि संदर्भ सही और ताज़ा है।'
        ]
      },

      // Disclaimer & Actions
      disclaimer: 'यह केवल एआई (AI) द्वारा किया गया आकलन है, अंतिम निर्णय नहीं। आगे भेजने से पहले आधिकारिक स्रोतों से पुष्टि करें।',
      checkAnotherBtn: 'दूसरा संदेश जाँचें',

      // Error UI
      errorHeading: 'जाँच पूरी नहीं हो सकी',
      tryAgainBtn: 'पुनः प्रयास करें',

      // Error Codes
      EMPTY_INPUT: 'कृपया पहले कोई संदेश चिपकाएँ या स्क्रीनशॉट चुनें।',
      TEXT_TOO_LONG: 'यह संदेश बहुत लंबा है। अधिकतम 5,000 अक्षरों तक चिपकाएँ।',
      BAD_FILE_TYPE: 'कृपया JPG, PNG या WEBP फ़ोटो अपलोड करें।',
      FILE_TOO_LARGE: 'यह फ़ोटो बहुत बड़ी है। कृपया 5 MB से छोटी फ़ोटो चुनें।',
      NO_TEXT_FOUND: 'हमें उस फ़ोटो में कोई लिखावट (टेक्स्ट) नहीं मिली।',
      RATE_LIMITED: 'एक साथ बहुत अधिक अनुरोध आए हैं। कृपया एक मिनट प्रतीक्षा करके पुनः प्रयास करें।',
      AI_FAILED: 'जाँच करते समय कुछ समस्या आई। कृपया पुनः प्रयास करें।'
    },

    kn: {
      skipToContent: 'ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ತೆರಳಿ',
      tagline: 'ಸಂದೇಶಗಳನ್ನು ಬೇರೆಯವರಿಗೆ ಕಳುಹಿಸುವ ಮುನ್ನ ಅವುಗಳ ಸತ್ಯಾಸತ್ಯತೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.',
      privacyNotice: 'ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತದೆ, ಎಲ್ಲಿಯೂ ಉಳಿಸಿಕೊಳ್ಳುವುದಿಲ್ಲ.',
      langAriaLabel: 'ಭಾಷೆ ಆಯ್ಕೆ',

      // Tabs
      tabText: 'ಪಠ್ಯ ಅಂಟಿಸಿ',
      tabImage: 'ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',

      // Text Input Mode
      textLabel: 'ಸಂಶಯಾಸ್ಪದ ಸಂದೇಶದ ಪಠ್ಯ',
      textPlaceholder: 'ವಾಟ್ಸಾಪ್ ಸಂದೇಶ, ಎಸ್‌ಎಂಎಸ್ ಅಥವಾ ಸಾಮಾಜಿಕ ಮಾಧ್ಯಮ ಪೋಸ್ಟ್ ಅನ್ನು ಇಲ್ಲಿ ಅಂಟಿಸಿ…',
      charCountTemplate: '{current} / 5,000',
      checkTextBtn: 'ಪಠ್ಯ ಪರಿಶೀಲಿಸಿ',
      thresholdAnnounce: '5,000 ರಲ್ಲಿ {current} ಅಕ್ಷರಗಳು ಬಳಸಲಾಗಿದೆ',

      // Image Input Mode
      imageLabel: 'ಸಂದೇಶದ ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
      dropPrompt: 'ಚಿತ್ರವನ್ನು ಆಯ್ಕೆಮಾಡಿ, ಇಲ್ಲಿಗೆ ಎಳೆಯಿರಿ, ಅಥವಾ ಅಂಟಿಸಿ',
      dropHint: 'JPG, PNG, WEBP ಬೆಂಬಲಿಸುತ್ತದೆ (ಗರಿಷ್ಠ 5 MB)',
      browseBtn: 'ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ',
      removeImage: 'ತೆಗೆದುಹಾಕಿ',
      checkImageBtn: 'ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಪರಿಶೀಲಿಸಿ',
      fileSizePrefix: 'ಗಾತ್ರ: ',

      // Loading Messages
      loadingInitial: 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…',
      loadingLong: 'ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಪರಿಶೀಲಿಸಲು ಕೆಲವು ಸೆಕೆಂಡುಗಳು ಬೇಕಾಗಬಹುದು…',

      // Verdict Headings
      likely_legitimate: 'ಬಹುಶಃ ನೈಜ ಸಂದೇಶ',
      needs_verification: 'ದೃಢೀಕರಣದ ಅಗತ್ಯವಿದೆ',
      suspicious: 'ಸಂಶಯಾಸ್ಪದ ಸಂದೇಶ',

      // Categories
      categoryPrefix: 'ಸಮಸ್ಯೆಯ ವಿಧ: ',
      misinformation: 'ತಪ್ಪು ಅಥವಾ ಸುಳ್ಳು ಮಾಹಿತಿ',
      scam: 'ವಂಚನೆ (ಸ್ಕ್ಯಾಮ್)',
      spam: 'ಸ್ಪ್ಯಾಮ್ ಸಂದೇಶ',
      none: 'ಯಾವುದೂ ಇಲ್ಲ',

      // Confidence Levels
      confidenceLabel: 'ವಿಶ್ವಾಸಾರ್ಹತೆಯ ಮಟ್ಟ:',
      confidence_low: 'ಕಡಿಮೆ',
      confidence_medium: 'ಮಧ್ಯಮ',
      confidence_high: 'ಹೆಚ್ಚು',

      // Indicators
      indicatorsHeading: 'ಕಂಡುಬಂದ ಎಚ್ಚರಿಕೆ ಚಿಹ್ನೆಗಳು',
      noIndicators: 'ಈ ಸಂದೇಶದಲ್ಲಿ ಯಾವುದೇ ನಿರ್ದಿಷ್ಟ ಎಚ್ಚರಿಕೆ ಚಿಹ್ನೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',

      // Extracted Text
      extractedTextHeading: 'ಸ್ಕ್ರೀನ್‌ಶಾಟ್‌ನಿಂದ ಓದಲಾದ ಪಠ್ಯ',
      extractedTextSub: 'ಇದು ನಿಮ್ಮ ಸ್ಕ್ರೀನ್‌ಶಾಟ್‌ಗೆ ಸರಿಯಾಗಿ ಹೊಂದಿಕೆಯಾಗುತ್ತದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ',

      // Next Steps Tips
      nextStepsHeading: 'ಮುಂದೆ ನೀವು ಏನು ಮಾಡಬಹುದು',
      tips: {
        suspicious: [
          'ಈ ಸಂದೇಶವನ್ನು ಇತರರಿಗೆ ಫಾರ್ವರ್ಡ್ ಮಾಡಬೇಡಿ ಅಥವಾ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.',
          'ಹಣ, ಒಟಿಪಿ (OTP), ಬ್ಯಾಂಕ್ ವಿವರಗಳು ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್‌ಗಳನ್ನು ಎಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.',
          'ಕಳುಹಿಸಿದವರು ಅಪರಿಚಿತರಾಗಿದ್ದರೆ ಅಥವಾ ಒತ್ತಡ ಹೇರುತ್ತಿದ್ದರೆ ಅವರನ್ನು ಬ್ಲಾಕ್ ಮಾಡಿ.'
        ],
        needs_verification: [
          'ನಂಬುವ ಮೊದಲು ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ಗಳು ಅಥವಾ ವಿಶ್ವಾಸಾರ್ಹ ಸುದ್ದಿಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
          'ಸತ್ಯಾಸತ್ಯತೆ ತಿಳಿಯಲು ಸಂದೇಶದ ಮುಖ್ಯ ಸಾಲುಗಳನ್ನು ಅಂತರ್ಜಾಲದಲ್ಲಿ ಹುಡುಕಿ.',
          'ಸತ್ಯಾಂಶಗಳು ದೃಢೀಕರಣಗೊಳ್ಳುವವರೆಗೆ ಇತರರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.'
        ],
        likely_legitimate: [
          'ಈ ಸಂದೇಶದಲ್ಲಿ ಅಪಾಯದ ಲಕ್ಷಣಗಳು ಕಂಡುಬಂದಿಲ್ಲ, ಆದರೂ ಎಚ್ಚರಿಕೆಯಿಂದಿರಿ.',
          'ಯಾವುದೇ ಲಿಂಕ್‌ಗಳು ಅಥವಾ ಹಣಕಾಸಿನ ವಿನಂತಿಗಳನ್ನು ಅಧಿಕೃತ ಮೂಲಗಳಿಂದಲೇ ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.',
          'ಹಂಚಿಕೊಳ್ಳುತ್ತಿದ್ದರೆ, ಮಾಹಿತಿ ಪ್ರಸ್ತುತ ಮತ್ತು ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.'
        ]
      },

      // Disclaimer & Actions
      disclaimer: 'ಇದು ಎಐ (AI) ಆಧಾರಿತ ಸಲಹೆಯಷ್ಟೇ, ಅಂತಿಮ ತೀರ್ಪಲ್ಲ. ಸಂದೇಶವನ್ನು ಹಂಚಿಕೊಳ್ಳುವ ಮುನ್ನ ಅಧಿಕೃತ ಮೂಲಗಳಿಂದ ಪರಿಶೀಲಿಸಿ.',
      checkAnotherBtn: 'ಮತ್ತೊಂದು ಸಂದೇಶ ಪರಿಶೀಲಿಸಿ',

      // Error UI
      errorHeading: 'ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ',
      tryAgainBtn: 'ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ',

      // Error Codes
      EMPTY_INPUT: 'ದಯವಿಟ್ಟು ಮೊದಲು ಸಂದೇಶವನ್ನು ಅಂಟಿಸಿ ಅಥವಾ ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಆಯ್ಕೆಮಾಡಿ.',
      TEXT_TOO_LONG: 'ಸಂದೇಶವು ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಗರಿಷ್ಠ 5,000 ಅಕ್ಷರಗಳವರೆಗೆ ಅಂಟಿಸಿ.',
      BAD_FILE_TYPE: 'ದಯವಿಟ್ಟು JPG, PNG ಅಥವಾ WEBP ಚಿತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.',
      FILE_TOO_LARGE: 'ಚಿತ್ರದ ಗಾತ್ರ ತುಂಬಾ ಹೆಚ್ಚಾಗಿದೆ. ದಯವಿಟ್ಟು 5 MB ಗಿಂತ ಕಡಿಮೆ ಇರುವ ಚಿತ್ರವನ್ನು ಬಳಸಿ.',
      NO_TEXT_FOUND: 'ಆ ಚಿತ್ರದಲ್ಲಿ ಯಾವುದೇ ಪಠ್ಯ ಕಂಡುಬಂದಿಲ್ಲ.',
      RATE_LIMITED: 'ಒಂದೇ ಬಾರಿಗೆ ಹಲವಾರು ವಿನಂತಿಗಳು ಬಂದಿವೆ. ದಯವಿಟ್ಟು ಒಂದು ನಿಮಿಷ ಕಾಯಿರಿ ಮತ್ತು ಪುನಃ ಪ್ರಯತ್ನಿಸಿ.',
      AI_FAILED: 'ಪರಿಶೀಲಿಸುವಾಗ ಏನೋ ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಪುನಃ ಪ್ರಯತ್ನಿಸಿ.'
    }
  };

  /**
   * Safe Translation Lookup Helper with Fallback to English
   * @param {string} key - Dictionary key
   * @param {string} [lang] - Language code ('en', 'hi', 'kn')
   * @returns {string} Translated text
   */
  function t(key, lang) {
    const activeLang = lang || state.currentLang || 'en';
    if (I18N[activeLang] && I18N[activeLang][key] !== undefined) {
      return I18N[activeLang][key];
    }
    if (I18N.en && I18N.en[key] !== undefined) {
      return I18N.en[key];
    }
    return key;
  }

  /* ==========================================================================
     3. APPLICATION STATE (IN-MEMORY ONLY)
     ========================================================================== */

  const state = {
    currentLang: 'en',
    activeTab: 'text',
    selectedFile: null,
    currentFileUrl: null,
    isBusy: false,
    currentRequestId: 0,
    abortController: null,
    loadingTimer: null,
    lastAnnouncedThreshold: 0
  };

  /* ==========================================================================
     4. DOM HELPERS
     ========================================================================== */

  /**
   * DOM Insertion Helper (Strictly using textContent for security)
   * // Security: All server and user strings are set via textContent only to prevent XSS (Cross-Site Scripting) attacks.
   * @param {HTMLElement} parent - Target parent node
   * @param {string} tag - Element tag name
   * @param {string} text - Plain text content
   * @returns {HTMLElement} Created child element
   */
  function addLine(parent, tag, text) {
    const el = document.createElement(tag);
    el.textContent = text !== undefined && text !== null ? String(text) : '';
    if (parent) {
      parent.appendChild(el);
    }
    return el;
  }

  /**
   * Creates SVG Icon Elements with Redundant Visual Encoding
   * (Shield for legit, circle for verification, triangle for suspicious, circle alert for error)
   * @param {string} type - Icon type identifier
   * @returns {SVGElement} Built SVG node
   */
  function createSvgIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    if (type === 'likely_legitimate') {
      svg.setAttribute('class', 'verdict-header__icon');
      const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shield.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      check.setAttribute('points', '9 12 11.5 14.5 15.5 9.5');
      svg.appendChild(shield);
      svg.appendChild(check);
    } else if (type === 'suspicious') {
      svg.setAttribute('class', 'verdict-header__icon');
      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tri.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '9'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '13');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '17'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '17');
      svg.appendChild(tri);
      svg.appendChild(l1);
      svg.appendChild(l2);
    } else if (type === 'error') {
      svg.setAttribute('class', 'error-card__icon');
      svg.setAttribute('width', '28');
      svg.setAttribute('height', '28');
      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.setAttribute('cx', '12'); circ.setAttribute('cy', '12'); circ.setAttribute('r', '10');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', '12'); l1.setAttribute('y1', '8'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '12');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', '12'); l2.setAttribute('y1', '16'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '16');
      svg.appendChild(circ);
      svg.appendChild(l1);
      svg.appendChild(l2);
    } else {
      // Default / needs_verification
      svg.setAttribute('class', 'verdict-header__icon');
      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.setAttribute('cx', '12'); circ.setAttribute('cy', '12'); circ.setAttribute('r', '10');
      const q = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      q.setAttribute('d', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dot.setAttribute('x1', '12'); dot.setAttribute('y1', '17'); dot.setAttribute('x2', '12.01'); dot.setAttribute('y2', '17');
      svg.appendChild(circ);
      svg.appendChild(q);
      svg.appendChild(dot);
    }

    return svg;
  }

  /**
   * Helper to format raw byte count into friendly readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted string
   */
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    return Math.round(bytes / 1024) + ' KB';
  }

  /* ==========================================================================
     5. VALIDATION LAYER
     ========================================================================== */

  /**
   * Validates plain text before dispatch
   * @param {string} text - Input message
   * @returns {{ valid: boolean, code?: string, text?: string }}
   */
  function validateText(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return { valid: false, code: 'EMPTY_INPUT' };
    }
    if (trimmed.length > LIMITS.MAX_TEXT_LENGTH) {
      return { valid: false, code: 'TEXT_TOO_LONG' };
    }
    return { valid: true, text: trimmed };
  }

  /**
   * Validates screenshot file before dispatch
   * @param {File} file - Selected file
   * @returns {{ valid: boolean, code?: string }}
   */
  function validateFile(file) {
    if (!file) {
      return { valid: false, code: 'EMPTY_INPUT' };
    }

    const name = file.name || '';
    const extIndex = name.lastIndexOf('.');
    const ext = extIndex !== -1 ? name.substring(extIndex).toLowerCase() : '';

    const mimeValid = ALLOWED_MIME_TYPES.includes(file.type);
    const extValid = ALLOWED_FILE_EXTENSIONS.includes(ext);

    if (!mimeValid || !extValid) {
      return { valid: false, code: 'BAD_FILE_TYPE' };
    }

    if (file.size > LIMITS.MAX_FILE_BYTES) {
      return { valid: false, code: 'FILE_TOO_LARGE' };
    }

    return { valid: true };
  }

  /* ==========================================================================
     6. API LAYER
     ========================================================================== */

  /**
   * Dispatches text check request to backend or returns mock result
   * @param {string} text - Message text
   */
  async function sendText(text) {
    const validation = validateText(text);
    if (!validation.valid) {
      showError({ code: validation.code });
      return;
    }

    setLoading(true);
    const thisRequestId = ++state.currentRequestId;

    if (state.abortController) {
      state.abortController.abort();
    }
    state.abortController = new AbortController();

    // Mock Mode Handler
    if (USE_MOCK) {
      setTimeout(() => {
        if (thisRequestId !== state.currentRequestId) return;
        setLoading(false);
        showResult(MOCK_RESULT);
      }, 600);
      return;
    }

    // Live Mode Handler
    const timeoutId = setTimeout(() => {
      if (state.abortController) {
        state.abortController.abort();
      }
    }, LIMITS.REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(API_ENDPOINTS.TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: validation.text }),
        signal: state.abortController.signal
      });

      clearTimeout(timeoutId);
      if (thisRequestId !== state.currentRequestId) return;

      if (!res.ok) {
        let errData = null;
        try {
          errData = await res.json();
        } catch (_) {
          // Response is not valid JSON
        }
        throw errData || { code: 'AI_FAILED' };
      }

      const data = await res.json();
      if (thisRequestId !== state.currentRequestId) return;

      setLoading(false);
      showResult(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (thisRequestId !== state.currentRequestId) return;
      showError(err && err.code ? err : { code: 'AI_FAILED' });
    }
  }

  /**
   * Dispatches screenshot check request via FormData or returns mock result
   * @param {File} file - Image file
   */
  async function sendImage(file) {
    const validation = validateFile(file);
    if (!validation.valid) {
      showError({ code: validation.code });
      return;
    }

    setLoading(true);
    const thisRequestId = ++state.currentRequestId;

    if (state.abortController) {
      state.abortController.abort();
    }
    state.abortController = new AbortController();

    // Mock Mode Handler
    if (USE_MOCK) {
      setTimeout(() => {
        if (thisRequestId !== state.currentRequestId) return;
        setLoading(false);
        showResult(MOCK_RESULT);
      }, 800);
      return;
    }

    // Live Mode Handler
    const timeoutId = setTimeout(() => {
      if (state.abortController) {
        state.abortController.abort();
      }
    }, LIMITS.REQUEST_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append('image', file);
      // Note: Do NOT set Content-Type header manually for FormData

      const res = await fetch(API_ENDPOINTS.IMAGE, {
        method: 'POST',
        body: formData,
        signal: state.abortController.signal
      });

      clearTimeout(timeoutId);
      if (thisRequestId !== state.currentRequestId) return;

      if (!res.ok) {
        let errData = null;
        try {
          errData = await res.json();
        } catch (_) {
          // Response is not valid JSON
        }
        throw errData || { code: 'AI_FAILED' };
      }

      const data = await res.json();
      if (thisRequestId !== state.currentRequestId) return;

      setLoading(false);
      showResult(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (thisRequestId !== state.currentRequestId) return;
      showError(err && err.code ? err : { code: 'AI_FAILED' });
    }
  }

  /* ==========================================================================
     7. RENDERING LAYER
     ========================================================================== */

  /**
   * Toggles the loading state, buttons, and accessibility indicators
   * @param {boolean} isLoading
   */
  function setLoading(isLoading) {
    state.isBusy = isLoading;

    const loadingEl = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const checkTextBtn = document.getElementById('checkTextBtn');
    const checkImageBtn = document.getElementById('checkImageBtn');
    const resultContainer = document.getElementById('result');

    if (isLoading) {
      if (loadingEl) loadingEl.hidden = false;
      if (loadingText) loadingText.textContent = t('loadingInitial', state.currentLang);
      if (checkTextBtn) checkTextBtn.disabled = true;
      if (checkImageBtn) checkImageBtn.disabled = true;
      if (resultContainer) {
        resultContainer.setAttribute('aria-busy', 'true');
        resultContainer.hidden = true;
      }

      // Reassure user after 8 seconds
      state.loadingTimer = setTimeout(() => {
        if (state.isBusy && loadingText) {
          loadingText.textContent = t('loadingLong', state.currentLang);
        }
      }, LIMITS.LOADING_REASSURANCE_MS);
    } else {
      if (loadingEl) loadingEl.hidden = true;
      if (checkTextBtn) checkTextBtn.disabled = false;
      if (checkImageBtn) checkImageBtn.disabled = false;
      if (resultContainer) {
        resultContainer.removeAttribute('aria-busy');
      }

      if (state.loadingTimer) {
        clearTimeout(state.loadingTimer);
        state.loadingTimer = null;
      }
    }
  }

  /**
   * Renders the advisory assessment result card defensively
   * @param {object} r - API response object
   */
  function showResult(r) {
    setLoading(false);

    const resultContainer = document.getElementById('result');
    if (!resultContainer) return;

    try {
      // Defensive fallback defaults
      const validVerdicts = ['likely_legitimate', 'needs_verification', 'suspicious'];
      const verdict = validVerdicts.includes(r && r.verdict) ? r.verdict : 'needs_verification';

      const validCategories = ['misinformation', 'scam', 'spam', 'none'];
      const category = validCategories.includes(r && r.category) ? r.category : 'none';

      const validConfidence = ['low', 'medium', 'high'];
      const confidence = validConfidence.includes(r && r.confidence) ? r.confidence : 'medium';

      const validLanguages = ['en', 'hi', 'kn'];
      const resultLang = (r && validLanguages.includes(r.language)) ? r.language : state.currentLang;

      // Clear container and reset role
      resultContainer.replaceChildren();
      resultContainer.className = 'result';
      resultContainer.setAttribute('role', 'region');
      resultContainer.setAttribute('lang', resultLang);
      resultContainer.hidden = false;

      // Main Card Wrapper
      const card = document.createElement('div');
      card.className = `result-card result-card--${verdict}`;

      // 1. Verdict Heading with Icon and Label
      const header = document.createElement('div');
      header.className = 'verdict-header';

      const icon = createSvgIcon(verdict);
      header.appendChild(icon);

      const title = addLine(header, 'h2', t(verdict, resultLang));
      title.className = 'verdict-header__title';
      title.tabIndex = -1; // For programmatic focus
      card.appendChild(header);

      // 2. Type of problem badge (Hidden if category is 'none')
      if (category !== 'none') {
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'category-badge-wrapper';

        const labelSpan = addLine(badgeWrap, 'span', t('categoryPrefix', resultLang));
        labelSpan.className = 'category-badge__label';

        const pillSpan = addLine(badgeWrap, 'span', t(category, resultLang));
        pillSpan.className = 'category-badge__pill';

        card.appendChild(badgeWrap);
      }

      // 3. Confidence Level: Three-segment visual meter PLUS text label (never percentage)
      const meterWrap = document.createElement('div');
      meterWrap.className = 'confidence-meter';

      const meterLabel = addLine(
        meterWrap,
        'span',
        `${t('confidenceLabel', resultLang)} ${t(`confidence_${confidence}`, resultLang)}`
      );
      meterLabel.className = 'confidence-meter__label';

      const meterTrack = document.createElement('div');
      meterTrack.className = 'confidence-meter__track';
      meterTrack.setAttribute('role', 'meter');
      meterTrack.setAttribute('aria-label', t('confidenceLabel', resultLang));
      meterTrack.setAttribute('aria-valuemin', '1');
      meterTrack.setAttribute('aria-valuemax', '3');

      const confValue = confidence === 'high' ? 3 : (confidence === 'medium' ? 2 : 1);
      meterTrack.setAttribute('aria-valuenow', String(confValue));
      meterTrack.setAttribute('aria-valuetext', t(`confidence_${confidence}`, resultLang));

      for (let i = 1; i <= 3; i++) {
        const segment = document.createElement('div');
        segment.className = `confidence-meter__segment${i <= confValue ? ' is-active' : ''}`;
        meterTrack.appendChild(segment);
      }
      meterWrap.appendChild(meterTrack);
      card.appendChild(meterWrap);

      // 4. Explanation (Inserted strictly via textContent)
      // Security: All server and user strings are set via textContent only to prevent XSS (Cross-Site Scripting) attacks.
      const explanationText = (r && typeof r.explanation === 'string') ? r.explanation : '';
      if (explanationText) {
        const explanationEl = addLine(card, 'p', explanationText);
        explanationEl.className = 'result__explanation';
      }

      // 5. Warning Signs Found (Indicators Section)
      const indicatorsSection = document.createElement('section');
      indicatorsSection.className = 'result__indicators';

      const indicatorsTitle = addLine(indicatorsSection, 'h3', t('indicatorsHeading', resultLang));
      indicatorsTitle.className = 'result__subheading';

      const indicatorsList = (r && Array.isArray(r.indicators)) ? r.indicators : [];
      if (indicatorsList.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'indicators-list';
        indicatorsList.forEach((ind) => {
          if (typeof ind === 'string' && ind.trim().length > 0) {
            const li = addLine(ul, 'li', ind);
            li.className = 'indicators-list__item';
          }
        });
        indicatorsSection.appendChild(ul);
      } else {
        const noteEl = addLine(indicatorsSection, 'p', t('noIndicators', resultLang));
        noteEl.className = 'result__note';
      }
      card.appendChild(indicatorsSection);

      // 6. Extracted Text from Image (When present)
      if (r && typeof r.extracted_text === 'string' && r.extracted_text.trim().length > 0) {
        const extSection = document.createElement('section');
        extSection.className = 'result__extracted';

        const extTitle = addLine(extSection, 'h3', t('extractedTextHeading', resultLang));
        extTitle.className = 'result__subheading';

        const extSub = addLine(extSection, 'p', t('extractedTextSub', resultLang));
        extSub.className = 'result__subtext';

        const preEl = addLine(extSection, 'pre', r.extracted_text);
        preEl.className = 'extracted-text-box';
        preEl.tabIndex = 0; // Accessible keyboard scrolling
        preEl.setAttribute('role', 'region');
        preEl.setAttribute('aria-label', t('extractedTextHeading', resultLang));

        card.appendChild(extSection);
      }

      // 7. What You Can Do Next (3 Static language-appropriate tips)
      const tipsSection = document.createElement('section');
      tipsSection.className = 'result__tips';

      const tipsTitle = addLine(tipsSection, 'h3', t('nextStepsHeading', resultLang));
      tipsTitle.className = 'result__subheading';

      const tipsUl = document.createElement('ul');
      tipsUl.className = 'tips-list';

      const tipsSource = (I18N[resultLang] && I18N[resultLang].tips && I18N[resultLang].tips[verdict])
        ? I18N[resultLang].tips[verdict]
        : I18N.en.tips[verdict];

      tipsSource.forEach((tipText) => {
        const li = addLine(tipsUl, 'li', tipText);
        li.className = 'tips-list__item';
      });
      tipsSection.appendChild(tipsUl);
      card.appendChild(tipsSection);

      // 8. Permanent Disclaimer
      const disclaimerEl = addLine(card, 'p', t('disclaimer', resultLang));
      disclaimerEl.className = 'result__disclaimer';

      // 9. Check Another Message Action Button
      const resetBtn = addLine(card, 'button', t('checkAnotherBtn', resultLang));
      resetBtn.type = 'button';
      resetBtn.className = 'btn btn--secondary result__reset-btn';
      resetBtn.addEventListener('click', () => {
        resultContainer.hidden = true;
        resultContainer.replaceChildren();

        // Return focus to active input
        if (state.activeTab === 'text') {
          const textInput = document.getElementById('textInput');
          if (textInput) textInput.focus();
        } else {
          const dropzone = document.getElementById('dropzone');
          if (dropzone) dropzone.focus();
        }
      });

      resultContainer.appendChild(card);

      // Programmatic focus on heading for screen reader announcement
      title.focus();
    } catch (_) {
      // Fall back safely if any unexpected rendering issue occurs
      showError({ code: 'AI_FAILED' });
    }
  }

  /**
   * Renders error state as a distinct, non-alarming neutral card
   * @param {{ code?: string }} err - Error code object
   */
  function showError(err) {
    setLoading(false);

    const resultContainer = document.getElementById('result');
    if (!resultContainer) return;

    const code = (err && typeof err.code === 'string') ? err.code : 'AI_FAILED';
    const lang = state.currentLang;

    resultContainer.replaceChildren();
    resultContainer.hidden = false;
    resultContainer.className = 'result result--error';
    resultContainer.setAttribute('role', 'alert');
    resultContainer.removeAttribute('lang');

    const card = document.createElement('div');
    card.className = 'error-card';

    const header = document.createElement('div');
    header.className = 'error-card__header';

    const icon = createSvgIcon('error');
    header.appendChild(icon);

    const title = addLine(header, 'h2', t('errorHeading', lang));
    title.className = 'error-card__title';
    title.tabIndex = -1;
    card.appendChild(header);

    // Map friendly translated message strictly from code
    const friendlyMessage = t(code, lang) || t('AI_FAILED', lang);
    const messageEl = addLine(card, 'p', friendlyMessage);
    messageEl.className = 'error-card__message';

    const retryBtn = addLine(card, 'button', t('tryAgainBtn', lang));
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn--secondary error-card__retry-btn';
    retryBtn.addEventListener('click', () => {
      resultContainer.hidden = true;
      resultContainer.replaceChildren();

      if (state.activeTab === 'text') {
        const textInput = document.getElementById('textInput');
        if (textInput) textInput.focus();
      } else {
        const dropzone = document.getElementById('dropzone');
        if (dropzone) dropzone.focus();
      }
    });
    card.appendChild(retryBtn);

    resultContainer.appendChild(card);
    title.focus();
  }

  /* ==========================================================================
     8. EVENT WIRING & USER INTERACTIONS
     ========================================================================== */

  /**
   * Updates all UI static labels, placeholders, and accessibility attributes
   * @param {string} lang - Language code
   */
  function updateLanguage(lang) {
    state.currentLang = lang;
    document.documentElement.lang = lang;

    // Update Language Buttons
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach((btn) => {
      const isSelected = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('is-active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    // Update Static Elements with data-i18n
    const translatableEls = document.querySelectorAll('[data-i18n]');
    translatableEls.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key, lang);
      }
    });

    // Update Placeholders
    const placeholderEls = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderEls.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.setAttribute('placeholder', t(key, lang));
      }
    });

    // Update ARIA Labels
    const ariaEls = document.querySelectorAll('[data-i18n-aria-label]');
    ariaEls.forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) {
        el.setAttribute('aria-label', t(key, lang));
      }
    });

    // Refresh character counter string format
    const textInput = document.getElementById('textInput');
    const charCounter = document.getElementById('charCounter');
    if (textInput && charCounter) {
      const len = textInput.value.length;
      charCounter.textContent = t('charCountTemplate', lang).replace('{current}', len.toLocaleString());
    }
  }

  /**
   * Switches input tab and manages accessible focus
   * @param {'text' | 'image'} targetTab
   */
  function switchTab(targetTab) {
    state.activeTab = targetTab;

    const tabText = document.getElementById('tab-text');
    const tabImage = document.getElementById('tab-image');
    const panelText = document.getElementById('panel-text');
    const panelImage = document.getElementById('panel-image');

    const isText = targetTab === 'text';

    if (tabText && tabImage && panelText && panelImage) {
      tabText.classList.toggle('is-active', isText);
      tabText.setAttribute('aria-selected', isText ? 'true' : 'false');
      tabText.tabIndex = isText ? 0 : -1;

      tabImage.classList.toggle('is-active', !isText);
      tabImage.setAttribute('aria-selected', !isText ? 'true' : 'false');
      tabImage.tabIndex = !isText ? 0 : -1;

      panelText.hidden = !isText;
      panelImage.hidden = isText;
    }
  }

  /**
   * Sets preview file and creates object URL
   * @param {File} file
   */
  function handleImageSelected(file) {
    const validation = validateFile(file);
    if (!validation.valid) {
      showError({ code: validation.code });
      return;
    }

    if (state.currentFileUrl) {
      URL.revokeObjectURL(state.currentFileUrl);
    }

    state.selectedFile = file;
    state.currentFileUrl = URL.createObjectURL(file);

    const previewImg = document.getElementById('preview');
    const previewName = document.getElementById('previewName');
    const previewSize = document.getElementById('previewSize');
    const previewContainer = document.getElementById('previewContainer');
    const dropzoneContent = document.getElementById('dropzoneContent');

    if (previewImg && previewContainer && dropzoneContent) {
      previewImg.src = state.currentFileUrl;
      previewImg.hidden = false;

      if (previewName) previewName.textContent = file.name || 'Screenshot';
      if (previewSize) previewSize.textContent = `${t('fileSizePrefix', state.currentLang)}${formatBytes(file.size)}`;

      previewContainer.hidden = false;
      dropzoneContent.hidden = true;
    }
  }

  /**
   * Clears selected screenshot file and revokes object URL
   */
  function clearImageSelection() {
    if (state.currentFileUrl) {
      URL.revokeObjectURL(state.currentFileUrl);
      state.currentFileUrl = null;
    }
    state.selectedFile = null;

    const fileInput = document.getElementById('imageInput');
    const previewImg = document.getElementById('preview');
    const previewContainer = document.getElementById('previewContainer');
    const dropzoneContent = document.getElementById('dropzoneContent');

    if (fileInput) fileInput.value = '';
    if (previewImg) {
      previewImg.src = '';
      previewImg.hidden = true;
    }
    if (previewContainer) previewContainer.hidden = true;
    if (dropzoneContent) dropzoneContent.hidden = false;
  }

  /**
   * Binds all listeners and keyboard navigation
   */
  function bindEvents() {
    // 1. Language switcher buttons
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        if (lang && lang !== state.currentLang) {
          updateLanguage(lang);
        }
      });
    });

    // 2. Tab Navigation with Arrow Keys
    const tabText = document.getElementById('tab-text');
    const tabImage = document.getElementById('tab-image');

    if (tabText && tabImage) {
      tabText.addEventListener('click', () => switchTab('text'));
      tabImage.addEventListener('click', () => switchTab('image'));

      const handleTabKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.activeTab === 'text') {
            switchTab('image');
            tabImage.focus();
          } else {
            switchTab('text');
            tabText.focus();
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (state.activeTab === 'image') {
            switchTab('text');
            tabText.focus();
          } else {
            switchTab('image');
            tabImage.focus();
          }
        } else if (e.key === 'Home') {
          e.preventDefault();
          switchTab('text');
          tabText.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          switchTab('image');
          tabImage.focus();
        }
      };

      tabText.addEventListener('keydown', handleTabKey);
      tabImage.addEventListener('keydown', handleTabKey);
    }

    // 3. Text Input & Live Character Counter
    const textInput = document.getElementById('textInput');
    const charCounter = document.getElementById('charCounter');
    const charAnnouncer = document.getElementById('charAnnouncer');
    const ANNOUNCE_THRESHOLDS = [4000, 4500, 4800, 4900, 4950, 5000];

    if (textInput && charCounter) {
      textInput.addEventListener('input', () => {
        const len = textInput.value.length;
        charCounter.textContent = t('charCountTemplate', state.currentLang).replace('{current}', len.toLocaleString());

        // Politely announce to screen readers only at key thresholds
        const crossed = ANNOUNCE_THRESHOLDS.find((threshold) => len >= threshold && state.lastAnnouncedThreshold < threshold);
        if (crossed && charAnnouncer) {
          state.lastAnnouncedThreshold = crossed;
          charAnnouncer.textContent = t('thresholdAnnounce', state.currentLang)
            .replace('{current}', len.toLocaleString())
            .replace('{max}', '5,000');
        } else if (len < 4000) {
          state.lastAnnouncedThreshold = 0;
        }
      });
    }

    // 4. Form Submissions
    const textForm = document.getElementById('textForm');
    if (textForm && textInput) {
      textForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendText(textInput.value);
      });
    }

    const imageForm = document.getElementById('imageForm');
    if (imageForm) {
      imageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendImage(state.selectedFile);
      });
    }

    // 5. Dropzone Interactions (Click, Keyboard, Drag-and-Drop, Paste)
    const dropzone = document.getElementById('dropzone');
    const imageInput = document.getElementById('imageInput');
    const removeImageBtn = document.getElementById('removeImageBtn');

    if (dropzone && imageInput) {
      dropzone.addEventListener('click', (e) => {
        // If clicking remove button, ignore dropzone click
        if (e.target.closest('#removeImageBtn')) return;
        if (!state.selectedFile) {
          imageInput.click();
        }
      });

      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('#removeImageBtn')) return;
          e.preventDefault();
          if (!state.selectedFile) {
            imageInput.click();
          }
        }
      });

      imageInput.addEventListener('change', () => {
        if (imageInput.files && imageInput.files[0]) {
          handleImageSelected(imageInput.files[0]);
        }
      });

      // Drag and Drop
      dropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleImageSelected(e.dataTransfer.files[0]);
        }
      });

      // Paste from Clipboard
      window.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const pastedFile = items[i].getAsFile();
            if (pastedFile) {
              switchTab('image');
              handleImageSelected(pastedFile);
              break;
            }
          }
        }
      });
    }

    // 6. Remove Image Button
    if (removeImageBtn) {
      removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearImageSelection();
        if (dropzone) dropzone.focus();
      });
    }
  }

  /* ==========================================================================
     9. INITIALIZATION
     ========================================================================== */

  /**
   * Detects browser preferred language: 'hi' or 'kn' default, otherwise 'en'
   * @returns {'en' | 'hi' | 'kn'}
   */
  function detectInitialLanguage() {
    const navLangs = navigator.languages || [navigator.language || 'en'];
    for (const lang of navLangs) {
      const code = (lang || '').toLowerCase().substring(0, 2);
      if (code === 'hi') return 'hi';
      if (code === 'kn') return 'kn';
    }
    return 'en';
  }

  function init() {
    const initialLang = detectInitialLanguage();
    updateLanguage(initialLang);
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
