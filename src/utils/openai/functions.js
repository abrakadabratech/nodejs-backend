const OpenAI = require("openai");
const Joi = require("joi");

const openai = new OpenAI({
  // apiKey: process.env.OPENAI_API_KEY,
  apiKey: "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",
});

async function processProduct({ title = "", description = "" }) {
  const systemPrompt = `
This system scrutinizes products uploaded to our platform, ensuring adherence to key guidelines:

No Sales Policy: Products suggesting sales, indicated by keywords like "sell" or similar, are to be flagged.

Prohibited Items: Ban includes edibles, weapons, narcotics, and illegal items.

Fields for Analysis:
Name: Product title.
Description: Product details.

Analysis Process:
The system evaluates all fields for keywords that violate policies or contain profanity words. If any field contains such keywords, the product may be flagged.

Response Format:
The system's findings should be reported in JSON format as follows:

{
  "match_score": 0, 
  "description": "" // Brief (8-12 words) explanation of the assessment, focusing on key factors influencing the score.
}

AI Processing Instructions:
Employ advanced natural language processing to detect keywords that may violate policies or contain profanity words. Assign a 'match_score' based on the severity of policy violation or profanity suspicion.

Scoring Criteria:
1) Give a score less than 40 if the product strictly violates the policies or contains profanity words.
2) Give a score between 40 and 70 if there is a suspicion of policy violation or profanity.
3) Give a score greater than 70 if the product looks good, doesn't violate any policy, and is free from profanity.

Special Consideration for Free Items:
If the product clearly indicates it is being given away for free without any sales-related keywords or profanity, assign a 'match_score' of 100 and a description indicating that the product is allowed for free.

Note: If any fields are missing or insufficient, allow the product to be posted without evaluation. If the product contains profanity but lacks a proper description, provide a description indicating both profanity and lack of proper description.`;

  // Use this modified prompt in your code for product evaluation.
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Title: ${title}\nDescription: ${description}`,
        },
      ],
      model: "gpt-3.5-turbo-1106",
      response_format: { type: "json_object" },
    });
    const parsedResponse = JSON.parse(completion.choices[0].message.content);

    const responseSchema = Joi.object({
      match_score: Joi.number().integer().min(0).max(100).required(),
      description: Joi.string().required(), // Adjust max length as needed
    });

    const { error } = responseSchema.validate(parsedResponse);

    // Return parsed response or fallback
    if (error) {
      console.log("Validation error:", error.details);
      return {
        match_score: 0,
        description: "Valid Product",
      };
    } else {
      return parsedResponse;
    }
  } catch (error) {
    console.error("Error in processing product:", error);
    return { match_score: 50, description: "Valid Product" };
  }
}

// async function test() {
//   const data = [
//     {
//       title: "jute basket",
//       description:
//         "A multipurpose small jute basket to store and carry small stuff.",
//       brand: "",
//     },
//     {
//       title: "earrings",
//       description: "Earrings",
//       brand: "NA",
//     },
//     {
//       title: "car cover",
//       description: "Baleno car cover",
//       brand: "Car cover",
//     },
//     {
//       title: "t-shirts",
//       description: "I would like to take this",
//       brand: "Central division",
//     },
//     {
//       title: "almeirha",
//       description: "Almeirha",
//       brand: "Godrej",
//     },
//     {
//       title: "study table",
//       description:
//         "screw based study table, you have to assemble worth of 5000 thousand, you can take it 2000.",
//       brand: "Student study table, good condition have to assemb",
//     },
//     {
//       title: "dishwasher",
//       description: "dishwasher with very good condition",
//       brand: "Hafele(aqua12s)",
//     },
//     {
//       title: "vaccum cleaner",
//       description: "mopn vac in very good condition",
//       brand: "Eureka Forbes,mopnvac",
//     },
//   ];

//   const delayBetweenRequests = 20000; // 20 seconds delay to limit to 3 requests per minute
//   let currentIndex = 0;

//   async function processNextProduct() {
//     if (currentIndex < data.length) {
//       const p = data[currentIndex];
//       const res = await processProduct(p);
//       console.log({
//         ...p,
//         ...res,
//         description: p.description,
//         vaidation_description: res.description,
//       });

//       currentIndex++;
//       setTimeout(processNextProduct, delayBetweenRequests);
//     }
//   }

//   processNextProduct();
// }

// test();

module.exports = { validateProduct: processProduct };
