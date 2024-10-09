import React, { useState, useEffect } from 'react';
import './Hero.scss';

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROK_KEY = process.env.REACT_APP_GROK_API_KEY;

function HeroMessage() {
  const [mainHeading, setMainHeading] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [smallText, setSmallText] = useState('');
  const [showBigButton, setShowBigButton] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  useEffect(() => {
    fetchMainHeading();
  }, []);

  const fetchMainHeading = async () => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + GROK_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content:
                "Create a 7 words impactful sentence on how many people are being affected by wildfires. Don't be unrealistic, use only real statistics AND NEVER ANSWER WITH MORE THAN 8 WORDS.",
            },
          ],
          model: 'llama3-8b-8192',
        }),
      });
      const data = await response.json();
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }
      let content = data.choices[0].message.content.trim();
      content = content.replace(/^"(.*)"$/, '$1') + '*';
      typeWriter(content, setMainHeading, 50, () => {
        setShowBigButton(true);
        fetchQuestions(content);
      });
    } catch (error) {
      console.error('Error in First API Call:', error);
    }
  };

  const fetchQuestions = async (firstPromptResult: string) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + GROK_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content:
                "List only 5 small questions related to wildfires, without any additional explanation or introduction. Each question should be a common question on wildfire hazards, with maximum 8 words each. Use these phrases as examples: 'How can I check if there's fire near me?', 'What are the health issues related to fire?', 'What's the best way to protect myself from smoke'. Each question should be separated by a newline.",
            },
          ],
          model: 'llama3-8b-8192',
        }),
      });
      const data = await response.json();
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }
      let content = data.choices[0].message.content.trim();
      content = content.replace(/^"(.*)"$/, '$1');
      const questions = content
        .split('\n')
        .filter((q: string) => q.trim() !== '');
      setQuestions(questions);
      setShowQuestions(true);
      //   fetchSmallText(firstPromptResult);
    } catch (error) {
      console.error('Error in Second API Call:', error);
    }
  };

  //   const fetchSmallText = async (firstPromptResult: string) => {
  //     try {
  //       const response = await fetch(API_URL, {
  //         method: 'POST',
  //         headers: {
  //           Authorization: 'Bearer ' + GROK_KEY,
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           messages: [
  //             {
  //               role: 'user',
  //               content: `Using real NASA open data about wildfires growth in recent years, create a small sentence that is directly related to the following phrase: "${firstPromptResult}". The sentence should be concise, without any introductions or explanations, and end with 'According to NASA open data'. Do not include phrases like 'Here is' or 'According to the data'; just provide the sentence. The answer must be less than 300 characters.`,
  //             },
  //           ],
  //           model: 'llama3-8b-8192',
  //         }),
  //       });
  //       const data = await response.json();
  //       if (data.error) {
  //         console.error('API Error:', data.error);
  //         return;
  //       }
  //       let smallTextContent = data.choices[0].message.content.trim();
  //       smallTextContent = smallTextContent.replace(/^"(.*)"$/, '$1');
  //       smallTextContent = '*' + smallTextContent;
  //       typeWriter(smallTextContent, setSmallText, 30);
  //     } catch (error) {
  //       console.error('Error in Third API Call:', error);
  //     }
  //   };

  const typeWriter = (
    text: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    delay: number,
    onComplete?: () => void
  ) => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setter((prev) => prev + text.charAt(index));
        index++;
      } else {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, delay);
  };

  return (
    <div className="hero-container">
      {/* <h1>{mainHeading}</h1>
            {showBigButton && (
                <a className="waves-effect waves-light btn-large big-button red">View Dashboard</a>
            )} */}
      {showQuestions && (
        <div className="question-buttons">
          {questions.map((question, index) => (
            <a
              key={index}
              className={`waves-effect waves-light btn question-btn color-${index}`}
            >
              {question}
            </a>
          ))}
        </div>
      )}
      {/* <div className="small-text">{smallText}</div> */}
    </div>
  );
}

export default HeroMessage;
