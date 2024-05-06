const { db } = require("../utils/firebase");
const { financialTerms, scamTerms, aggressiveTerms } = require("./dataset");
const nlp = require('compromise');

async function isUserBlocked(blockerId, blockedId) {
  const blocksSnapshot = await db
    .collection("blocks")
    .where("blocker", "==", blockerId)
    .where("blocked", "==", blockedId)
    .get();

  return !blocksSnapshot.empty;
}



async function evaluateMessage(message) {
    // Asynchronous checks for URLs, emails, phone numbers, and UPI IDs
    const checkPatterns = [
        {
            regex: /\bhttps?:\/\/\S+/gi,
            message: 'Be cautious: This message contains links which could lead to unsafe websites.'
        },
        {
            regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
            message: 'Alert: Email addresses detected. Sharing personal emails can compromise your privacy.'
        },
        {
            regex: /\b\d{10}\b/,
            message: 'Notice: Phone numbers detected. Be cautious about sharing or contacting unknown numbers.'
        },
        {
            regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\b/,
            message: 'Warning: UPI IDs are mentioned. Only proceed with payments if you trust the recipient.'
        }
    ];

    const patternChecks = checkPatterns.map(pattern => {
        return new Promise(resolve => {
            if (pattern.regex.test(message)) {
                resolve(pattern.message);
            } else {
                resolve(null);
            }
        });
    });

    // NLP-based checks for terms and phrases
    const doc = nlp(message);
    const terms = [
        {
            list: financialTerms,
            message: 'Security alert: Financial terms like "{term}" detected. Ensure all transactions are secure and verified.'
        },
        {
            list: scamTerms,
            message: 'Caution: Phrases such as "{term}", often used in scams, were found in this message.'
        },
        {
            list: aggressiveTerms,
            message: 'Heads up: The message contains high-pressure tactics like "{term}"—typical of deceptive offers.'
        }
    ];

    const nlpChecks = terms.map(termCategory => {
        return new Promise(resolve => {
            const foundTerms = termCategory.list.filter(term => doc.has(term));
            const warnings = foundTerms.map(term => termCategory.message.replace('{term}', term));
            resolve(warnings);
        });
    });

    // Combine all promises and compile the results
    return Promise.all([...patternChecks, ...nlpChecks.flat()])
        .then(results => {
            const warnings = results.flat().filter(warning => warning != null);
            return {
                needsWarning: warnings.length > 0,
                warnings: warnings
            };
        });
}







module.exports = { isUserBlocked,evaluateMessage };
