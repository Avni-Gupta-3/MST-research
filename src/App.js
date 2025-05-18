import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import './App.css';
import './themes.css';

function App() {
  useEffect(() => {
    console.log("Using API key:", process.env.REACT_APP_OPENAI_API_KEY);
  }, []);
  // General Feedback state
  const [generalFeedback, setGeneralFeedback] = useState([]);
  const [generalFeedbackError, setGeneralFeedbackError] = useState('');
  // Track resolved feedback indices for checkboxes
  const [resolvedFeedbackIndices, setResolvedFeedbackIndices] = useState([]);
  // State for AI-generated comments (array of {text, detail})
  const [aiComments, setAiComments] = useState([]);
  // State for comments tab checkboxes (resolved/unresolved)
  const [commentCheckboxes, setCommentCheckboxes] = useState(
    Array.from({ length: 10 }, () => false)
  );
  // State for expanded/collapsed comments
  const [expandedComments, setExpandedComments] = useState(Array.from({ length: 10 }, () => false));
  // State for rubric-based scores
  const [rubricScores, setRubricScores] = useState([]);
  // Show resolved feedback toggle
  const [showResolvedFeedback, setShowResolvedFeedback] = useState(false);
  // Dynamic resizing effect for chatbox-input textarea with overflow and maxHeight constraints
  useEffect(() => {
    const textarea = document.querySelector(".chatbox-input");
    if (!textarea) return;

    const adjustHeight = () => {
      textarea.style.height = "auto";
      textarea.style.overflowY = "hidden";
      const newHeight = Math.min(textarea.scrollHeight, 120); // reduce cap
      textarea.style.height = newHeight + "px";
      // Also update chatbot-messages height
      const chatMessages = document.querySelector('.chatbot-messages');
      if (chatMessages) {
        const totalHeight = chatMessages.parentElement.clientHeight;
        const inputHeight = textarea.offsetHeight + 30; // Approximate padding/margin
        chatMessages.style.height = `${totalHeight - inputHeight}px`;
      }
    };

    textarea.addEventListener("input", adjustHeight);
    adjustHeight(); // ensure correct height on mount
    // Also update chatbot-messages height after initial adjust
    const chatMessages = document.querySelector('.chatbot-messages');
    if (chatMessages) {
      const totalHeight = chatMessages.parentElement.clientHeight;
      const inputHeight = textarea.offsetHeight + 30; // Approximate padding/margin
      chatMessages.style.height = `${totalHeight - inputHeight}px`;
    }
    return () => textarea.removeEventListener("input", adjustHeight);
  }, []);
  const openingMessages = [
    "Hey! I’m PenPal AI — ready when you are. I can help with structure, clarity, tone, or just typing things out.",
    "Hi there! I’m PenPal AI, your writing buddy. Need help brainstorming, rewording, or just getting started?",
    "I’m PenPal AI! Whenever you’re ready, I can help make your writing smoother, sharper, or more *you*.",
    "Hi! I'm PenPal AI. Tell me where you're stuck — I’m great at untangling thoughts and tidying up drafts.",
    "Hello! I’m PenPal AI, and I love words. Want help making yours shine?"
  ];
  const [essay, setEssay] = useState(() => {
    return localStorage.getItem('penpalEssay') || '';
  });
  const [isRefreshingComments, setIsRefreshingComments] = useState(false);
  useEffect(() => {
    localStorage.setItem('penpalEssay', essay);
  }, [essay]);
  const [focus, setFocus] = useState('');
  const [rubric, setRubric] = useState('');
  const [tone, setTone] = useState('encouraging');
  const [style, setStyle] = useState('Concise');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showFeedback, setShowFeedback] = useState(() => {
    return localStorage.getItem('penpalShowFeedback') === 'true';
  });
  const [activeTab, setActiveTab] = useState(() => {
    // Add 'summary' and 'comments' as valid options, but default remains 'feedback'
    const stored = localStorage.getItem('penpalActiveTab');
    if (stored === 'feedback' || stored === 'chatbot' || stored === 'summary' || stored === 'comments') {
      return stored;
    }
    return 'feedback';
  });
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('penpalMessages');
    return saved ? JSON.parse(saved) : [
      { sender: 'bot', text: openingMessages[Math.floor(Math.random() * openingMessages.length)] }
    ];
  });
  // [isRefreshingComments, setIsRefreshingComments] is already declared above, as requested.
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [showRubricTable, setShowRubricTable] = useState(true);
  // --- General feedback generation logic moved out of effect, and effect removed ---
  // Hoisted function for generating general feedback.
  // Toggle for showing more feedback items
  const [showAllFeedback, setShowAllFeedback] = useState(false);

  // Helper: simple string similarity for titles (case-insensitive, ignore punctuation, check inclusion)
  function areTitlesSimilar(a, b) {
    if (!a || !b) return false;
    const clean = s => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const ca = clean(a), cb = clean(b);
    return ca === cb || ca.includes(cb) || cb.includes(ca);
  }

  // Helper: prioritize feedback items based on textual clues
  function getPriority(item) {
    // High priority if title or detail contains these signals
    const signals = [
      'repetition', 'repetitive', 'repeated', 'vague', 'unclear', 'conclusion', 'transition',
      'missing', 'structure', 'clarity', 'focus', 'thesis', 'organization', 'evidence', 'support'
    ];
    const text = (item.title + ' ' + item.detail).toLowerCase();
    for (let i = 0; i < signals.length; ++i) {
      if (text.includes(signals[i])) return 10 - i; // Higher score for earlier signals
    }
    return 0;
  }

  // Helper: format the detail for feedback best practices
  function formatDetail(title, detail) {
    // If detail already has suggestion, keep, else add a suggestion starter.
    let explanation = detail;
    let suggestion = '';
    let why = '';
    // Try to split explanation and suggestion if possible
    if (detail) {
      // Find a sentence that starts with "Try", "Consider", "You could", "Aim to", etc.
      const match = detail.match(/(Try|Consider|You could|Aim to|To improve|For example)[^.!?]*[.!?]/i);
      if (match) {
        explanation = detail.slice(0, match.index).trim();
        suggestion = detail.slice(match.index).trim();
      }
    }
    // If explanation is too short, use a generic why
    if (!explanation || explanation.length < 15) {
      why = `This matters for clarity and impact. `;
    }
    // If no suggestion, add a generic next step
    if (!suggestion) {
      suggestion = `Try rewriting a sentence or section to address this.`;
    }
    // Add a revision question if not present
    let question = '';
    if (!detail.toLowerCase().includes('what') && !detail.toLowerCase().includes('how')) {
      question = ` What’s the one thing you want the reader to take away here?`;
    }
    return `${explanation || why}${suggestion}${question}`;
  }

  // Helper: bold the title (for markdown)
  function formatTitle(title) {
    return `**${title}**`;
  }

  useEffect(() => {
    const chatContainer = document.querySelector('.chatbot-messages');
    if (chatContainer) {
      requestAnimationFrame(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  }, [messages]);

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem('penpalMessages', JSON.stringify(messages));
  }, [messages]);

  // Persist activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('penpalActiveTab', activeTab);
  }, [activeTab]);

  // Persist showFeedback to localStorage
  useEffect(() => {
    localStorage.setItem('penpalShowFeedback', showFeedback);
  }, [showFeedback]);

  const handleSend = async () => {
    if (chatInput.trim() === '') return;

    const newMessages = [...messages, { sender: 'user', text: chatInput }];
    setMessages(newMessages);
    setChatInput('');
    setIsBotTyping(true);

    try {
      const systemMessage = {
        role: 'system',
        content: `You are PenPal AI — a concise, thoughtful, and emotionally intelligent writing assistant built for classroom use. You're here to help students *think* better and *write* better — not flatter them or write for them.

Your tone is warm and grounded, but not gushy or repetitive. Speak like a smart friend who's sharp, honest, and wants them to grow.

🌟 Guidelines:
- Keep your answers specific, analytical, and clear. Don't restate the essay.
- Avoid vague praise like “bold,” “thought-provoking,” or “compelling” unless followed by why.
- Never rewrite or write their essay. Instead, suggest *how* to improve (e.g., “Try adding a counterexample here,” or “This claim would be stronger with a stat or source.”)
- Be concise. Don’t yap.
- Ask questions if you're not sure what they mean.
- Use warm emojis sparingly (like 😊 or ✨) to encourage, but never distract.
- Respect sensitive or taboo topics — don't moralize, just focus on clarity and depth.
- Never sound like a robot or a teacher who didn’t read the essay. Always be present.

Always assume the student has read their own essay. Do **not** tell them to add things they’ve already included — if a point is already addressed, either suggest how to make it stronger, or don’t mention it at all. Never give boilerplate advice like “consider adding a call to action” unless it’s actually missing and appropriate. Your job is not to suggest changes — it’s to make their actual work better.`
      };

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          stream: true,
          messages: [
            systemMessage,
            ...newMessages.map(msg => ({
              role: msg.sender === 'user' ? 'user' : 'assistant',
              content: msg.text
            })),
            {
              role: 'user',
              content: `Here's my latest draft:\n\n${essay}\n\nTone: ${tone}\nStyle: ${style}\nAdditional Notes: ${customInstructions}\nRubric:\n${rubric}\n\nHere's what I want help with:\n${chatInput}`
            }
          ]
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let messageText = '';
      setMessages(prev => [...prev, { sender: 'bot', text: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const jsonStr = line.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') {
            setIsBotTyping(false);
            return;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              messageText += delta;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.sender === 'bot') {
                  updated[updated.length - 1] = { ...last, text: messageText };
                }
                return updated;
              });
              await new Promise(resolve => setTimeout(resolve, 20));
            }
          } catch (err) {
            console.error('Error parsing stream chunk:', err);
          }
        }
      }
      setIsBotTyping(false);
    } catch (err) {
      console.error('Error:', err);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Something went wrong.' }]);
      setIsBotTyping(false);
    }
  };

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });
  
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setRubric(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async () => {
    console.log(`Selected writing tone: ${tone}`);
    // When submitting, also generate AI comments for the comments tab
    // Show feedback UI
    setShowFeedback(true);

    // Rubric-based scoring and explanation
    if (rubric.trim()) {
      try {
        const rubricPrompt = `
You are given a rubric in table format and a student essay. The rubric uses scoring levels (Excellent = 5, Good = 4, Adequate = 3, Needs Work = 2, Poor = 1). Each row is a different criterion. Match the essay to the most fitting description per row and assign a numeric score from 1 to 5. Return your output as a JSON array where each object has:
- criterion: name of the rubric row
- score: the numeric score from 1–5
- total: always 5
- details: a brief explanation of how you chose the score

Rubric:
${rubric}

Essay:
${essay}

Return only the JSON array.
        `;

        const rubricRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'user', content: rubricPrompt }
            ]
          })
        });

        const rubricData = await rubricRes.json();
        // Debug: print raw GPT output for rubric
        console.log("Raw rubric GPT output:", rubricData.choices[0].message.content);
        try {
          const cleanContent = rubricData.choices[0].message.content
            .replace(/^```json\s*/i, '')
            .replace(/```$/, '')
            .trim();
          const parsedRubric = JSON.parse(cleanContent);
          setRubricScores(parsedRubric);
        } catch (parseErr) {
          console.error('Rubric parsing failed:', parseErr);
          setRubricScores([]);
        }
      } catch (err) {
        console.error('Failed to generate rubric-based feedback:', err);
        setRubricScores([]);
      }
    }

    // Improved comment count logic based on paragraph length
    const estimatedParagraphs = essay.split('\n').filter(p => p.trim().length > 100).length;
    const commentCount = Math.min(Math.max(estimatedParagraphs * 4, 10), 25);
    // Call OpenAI API to generate comments
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: "You are a writing assistant. Read the student's essay and provide a set of short comment suggestions with a brief description and a longer explanation if needed." },
            {
              role: 'user',
              content: `You're helping improve a student's essay. Give extremely specific and paragraph-linked feedback. Each comment should:
- Reference a particular paragraph or quote directly.
- Address an actionable area for revision.
- Be useful even for high-quality essays.

Student's settings:
Tone: ${tone}
Style: ${style}
Extra Instructions: ${customInstructions || "None"}
Rubric: ${rubric || "None"}

Essay:
${essay}

Return a JSON array of ${commentCount} objects like:
[
  { "text": "Short, specific suggestion", "detail": "Expanded explanation and revision advice." }
]
Do not include commentary or markdown.`
            }
          ]
        })
      });
      const data = await res.json();
      try {
        const parsed = JSON.parse(data.choices[0].message.content);
        setAiComments(parsed);
        setCommentCheckboxes(Array(parsed.length).fill(false));
        setExpandedComments(Array(parsed.length).fill(false));
      } catch (err) {
        console.error('Failed to parse AI comment response:', data.choices[0].message.content);
      }
    } catch (err) {
      console.error('Failed to generate AI comments:', err);
    }
  };

  // --- End of feedback generation logic changes ---

  // Handler for checkbox toggle (resolved/unresolved)
  const handleFeedbackResolvedChange = (idx, checked) => {
    setGeneralFeedback(prev =>
      prev.map((item, i) =>
        i === idx ? { ...item, resolved: checked } : item
      )
    );
    setResolvedFeedbackIndices(prev => {
      if (checked) return [...prev, idx];
      return prev.filter(i => i !== idx);
    });
  };

  return (
    <div className="container">
      <div className="top-bar">
        <h1 className="title">PenPal AI ⭐</h1>
        <button onClick={() => {
          setShowFeedback(false);
          setActiveTab('feedback');
          setMessages([
            { sender: 'bot', text: openingMessages[Math.floor(Math.random() * openingMessages.length)] }
          ]);
          setChatInput('');
          localStorage.removeItem('penpalMessages');
          localStorage.removeItem('penpalShowFeedback');
          localStorage.removeItem('penpalActiveTab');
        }} className="back-home-btn">
          ⬅️ Home
        </button>
        <button onClick={toggleTheme} className="toggle-theme-btn">
  {theme === 'light' ? '🌙' : '☀️'}
</button>
      </div>
      <div className="content">
        <div className={`essay-input ${showFeedback ? 'shrink' : ''}`}>
          <textarea
            rows="10"
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            placeholder="Start typing here..."
            className="text-area"
          />
        </div>

        {!showFeedback && (
          <div className="sidebar">
            <div className="customization-section">
              <label htmlFor="writingTone">What tone do you want your writing to be?</label>
              <select
                id="writingTone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="custom-dropdown"
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Direct">Direct</option>
                <option value="Analytical">Analytical</option>
                <option value="Casual">Casual</option>
                <option value="Academic">Academic</option>
              </select>
            </div>

            <div className="customization-section">
              <label htmlFor="writingStyle">What style do you want your writing to be?</label>
              <select
                id="writingStyle"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="custom-dropdown"
              >
                <option value="Concise">Concise</option>
                <option value="Descriptive">Descriptive</option>
                <option value="Persuasive">Persuasive</option>
                <option value="Narrative">Narrative</option>
              </select>
            </div>

            <div className="customization-section">
              <label htmlFor="customInstructions">Anything else we should know?</label>
              <textarea
                id="customInstructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="E.g., Use British spelling or avoid passive voice"
                className="text-area-small notes-input"
              />
            </div>

            { !showFeedback && (
              <div className="customization-section">
                <label htmlFor="rubricUpload"><strong>Insert a rubric (optional)</strong></label>
                <input id="rubricUpload" type="file" accept=".txt" onChange={handleFileUpload} className="file-input" />
                <textarea
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  placeholder="Or paste your rubric here..."
                  className="text-area-small notes-input"
                />
              </div>
            )}

            <button onClick={handleSubmit} className="submit-btn">Get Feedback!</button>
          </div>
        )}

        {showFeedback && (
          <PanelGroup direction="horizontal">
            <Panel>
              <div className={`essay-input shrink`}>
                <textarea
                  rows="10"
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  placeholder="Start typing here..."
                  className="text-area"
                />
              </div>
            </Panel>
            <PanelResizeHandle />
            <Panel>
              <div className={`feedback-box ${activeTab === 'feedback' ? 'feedback-active' : 'chatbot-active'}`}>
                <div className="feedback-toggle-bar">
                  <button
                    className={activeTab === 'feedback' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => setActiveTab('feedback')}
                  >
                    ✍️ Feedback
                  </button>
                  <button
                    className={activeTab === 'comments' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => setActiveTab('comments')}
                  >
                    💬 Comments
                  </button>
                  <button
                    className={activeTab === 'chatbot' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => setActiveTab('chatbot')}
                  >
                    Ask PenPalAI
                  </button>
                </div>

                {activeTab === 'feedback' && (
                  <>
                    {/*
                      Rubric Overview section with toggle button and conditional table rendering
                    */}
                    {/*
                      Add showRubricTable state and toggle button
                    */}
                    {/* Rubric Overview section */}
                    <div className="rubric-feedback-section">
                      <div
                        className="rubric-header-container"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '1rem'
                        }}
                      >
                        <h2 className="rubric-header" style={{ margin: 0 }}>Rubric Overview</h2>
                        <button
                          className="rubric-toggle-btn"
                          onClick={() => setShowRubricTable(!showRubricTable)}
                        >
                          {showRubricTable ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      {showRubricTable && (
                        <table className="rubric-table">
                          <thead>
                            <tr>
                              <th>Criterion</th>
                              <th>Score</th>
                              <th>Total</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rubricScores.length === 0 && (
                              <tr>
                                <td colSpan="4" style={{ textAlign: 'center', opacity: 0.6 }}>
                                  No rubric feedback available. Check your rubric format or try again.
                                </td>
                              </tr>
                            )}
                            {rubricScores.map((row, i) => (
                              <tr key={i}>
                                <td>{row.criterion}</td>
                                <td>{row.score}</td>
                                <td>{row.total}</td>
                                <td>{row.details}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
                {activeTab === 'comments' && (
                  <>
                    <div className="comments-header">
                      <button
                        className="feedback-action-btn"
                        onClick={() => setShowResolvedFeedback(!showResolvedFeedback)}
                      >
                        {showResolvedFeedback ? 'Hide Resolved Comments' : 'Show Resolved Comments'}
                      </button>
                      <button
                        className="feedback-action-btn"
                        onClick={async () => {
                          setIsRefreshingComments(true);
                          try {
                            // Improved comment count logic based on paragraph length
                            const estimatedParagraphs = essay.split('\n').filter(p => p.trim().length > 100).length;
                            const commentCount = Math.min(Math.max(estimatedParagraphs * 4, 10), 25);
                            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
                              },
                              body: JSON.stringify({
                                model: 'gpt-4o',
                                messages: [
                                  { role: 'system', content: "You are a writing assistant. Read the student's essay and provide a set of short comment suggestions with a brief description and a longer explanation if needed." },
                                  {
                                    role: 'user',
                                    content: `You're helping improve a student's essay. Give extremely specific and paragraph-linked feedback. Each comment should:
- Reference a particular paragraph or quote directly.
- Address an actionable area for revision.
- Be useful even for high-quality essays.
help them bulid on these settings, they are what they want their essay to feel like.
Student's settings:
Tone: ${tone}
Style: ${style}
Extra Instructions: ${customInstructions || "None"}
Rubric: ${rubric || "None"}

Essay:
${essay}

Return a JSON array of ${commentCount} objects like:
[
  { "text": "Short, specific suggestion", "detail": "Expanded explanation and revision advice." }
]
Do not include commentary or markdown.`
                                  }
                                ]
                              })
                            });
                            const data = await res.json();
                            try {
                              const parsed = JSON.parse(data.choices[0].message.content);
                              setAiComments(prev => [...prev, ...parsed]);
                              setCommentCheckboxes(prev => [...prev, ...Array(parsed.length).fill(false)]);
                              setExpandedComments(prev => [...prev, ...Array(parsed.length).fill(false)]);
                            } catch (err) {
                              console.error('Failed to parse AI comment response:', data.choices[0].message.content);
                            }
                          } finally {
                            setIsRefreshingComments(false);
                          }
                        }}
                      >
                        {isRefreshingComments ? 
                          <span>
                            Refreshing
                            <span className="dot-bounce">. </span>
                            <span className="dot-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                            <span className="dot-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                          </span>
                        : 'Refresh Comments'}
                      </button>
                    </div>
                    <div className="comment-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                      {aiComments.map((comment, i) => {
                        if (!showResolvedFeedback && commentCheckboxes[i]) return null;
                        return (
                          <div key={i} className="comment-item">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                              <div style={{ paddingTop: '0.2rem' }}>
                                <input
                                  type="checkbox"
                                  checked={commentCheckboxes[i] || false}
                                  onChange={(e) => {
                                    const newStates = [...commentCheckboxes];
                                    newStates[i] = e.target.checked;
                                    setCommentCheckboxes(newStates);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              <div
                                onClick={() => {
                                  const newExpanded = [...expandedComments];
                                  newExpanded[i] = !newExpanded[i];
                                  setExpandedComments(newExpanded);
                                }}
                                style={{ cursor: 'pointer', flex: 1 }}
                              >
                                <span><strong>Comment #{i + 1}:</strong> {comment.text}</span>
                                {expandedComments[i] && (
                                  <div style={{
                                    marginTop: '0.25rem',
                                    backgroundColor: 'rgba(100, 150, 255, 0.15)',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '0.95rem',
                                    border: '1px solid rgba(100, 150, 255, 0.35)'
                                  }}>
                                    {comment.detail}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {activeTab === 'chatbot' && (
                 <div className="chatbot-interface">
                 
                 <div className="chatbot-messages">
                   {messages.map((msg, i) => (
                     <div key={i} className={msg.sender === 'bot' ? 'bot-message' : 'user-message'}>
                       <ReactMarkdown>{msg.text}</ReactMarkdown>
                     </div>
                   ))}
                 </div>
                 <div className="chatbot-input-area">
                   <textarea
                     placeholder="Type your question..."
                     value={chatInput}
                     onChange={(e) => setChatInput(e.target.value)}
                     className="chatbox-input"
                     rows={1}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSend();
                       }
                     }}
                   />
                   <button className="chatbox-send" onClick={handleSend}>⏩</button>
                 </div>
               </div>
                )}


              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}

export default App;

