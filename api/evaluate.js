export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '未在 Vercel 配置 AI_API_KEY 环境变量' });
  }

  const { action, level, topic, keywords, challenge, userInput } = req.body || {};

  try {
    let prompt = '';
    if (action === 'generate_question') {
      const topicPrompt = (topic && topic !== '不限主题') 
        ? `围绕【${topic}】这个主题视角` 
        : `从日常生活、自然天气、奇幻冒险、校园生活、科幻探索、情感表达等任意主题中全库随机发散`;

      prompt = `你是一个优秀的语文老师。请为【${level || '容易'}】难度、${topicPrompt}，随机生成一组全新的造句题目。

难度设计指导：
- 【容易】难度（小学低年段）：给 2 个常见、生动但不俗套的词语。要求提示尽量亲切通俗（如：描述一个场景或心情）。
- 【轻松】难度（小学高年段）：给 2-3 个词语。限制要求中必须随机包含以下一项要求：
  * 感情基调：悬疑、反转、温暖、幽默或感动
  * 修辞手法：使用比喻、拟人、排比或夸张
  * 句式逻辑：使用“虽然……但是……”、“不仅……而且……”、或者使用反问句/疑问句
- 【一般/困难/魔鬼】：按学段逐步提升词汇深度与逻辑/文采限制。

严格输出 JSON 格式（不要多余文字或 markdown 标记）：
{"keywords": ["词语1", "词语2"], "challenge": "具体的限制要求"}`;

    } else if (action === 'evaluate_sentence') {
      prompt = `评估造句：
难度：${level}
主题：${topic || '不限主题'}
关键词：${(keywords || []).join(', ')}
限制要求：${challenge}
学生造句：${userInput}

请按以下 JSON 格式评估，不要带有 markdown 标记或多余文字：
{"score": 85, "feedback": "详细点评及扣分项", "sampleSentence": "满分示范例句"}`;
    } else {
      return res.status(400).json({ error: '无效的 action 参数' });
    }

    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash'
    ];

    let lastError = null;
    let data = null;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const result = await response.json();

      if (response.ok) {
        data = result;
        break;
      } else {
        console.warn(`模型 ${model} 响应失败，尝试备用模型...`, result);
        lastError = result;
      }
    }

    if (!data) {
      return res.status(503).json({ 
        error: `Gemini API 繁忙: ${lastError?.error?.message || '所有模型均处于高峰期，请稍后再试'}` 
      });
    }

    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      return res.status(500).json({ error: 'AI 未返回有效内容' });
    }

    const cleanJsonStr = textResult.replace(/```json\n?|```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonStr);

    return res.status(200).json(parsedData);

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: `后端处理失败: ${err.message}` });
  }
}
