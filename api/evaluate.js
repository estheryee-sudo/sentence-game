export default async function handler(req, res) {
  // 设置 CORS 跨域头
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

  const { action, level, keywords, challenge, userInput } = req.body || {};

  try {
    let prompt = '';
    if (action === 'generate_question') {
      prompt = `请为【${level || '容易'}】难度生成造句题目。输出格式必须严格为以下 JSON，不要包含任何其他文字或 markdown 格式：
{"keywords": ["词语1", "词语2"], "challenge": "附加限制要求"}`;
    } else if (action === 'evaluate_sentence') {
      prompt = `评估造句：
难度：${level}
关键词：${(keywords || []).join(', ')}
要求：${challenge}
学生造句：${userInput}

请按以下 JSON 格式评估，不要带有 markdown 标记或多余文字：
{"score": 85, "feedback": "详细点评及扣分项", "sampleSentence": "满分示范例句"}`;
    } else {
      return res.status(400).json({ error: '无效的 action 参数' });
    }

    // 使用官方 Gemini 1.5 Flash 接口
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // 暴露具体的 Google API 报错信息
      console.error("Gemini API Error:", data);
      return res.status(response.status).json({ 
        error: `Gemini API 拒绝响应: ${data.error?.message || JSON.stringify(data)}` 
      });
    }

    // 提取生成的文本内容
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      return res.status(500).json({ error: 'AI 未返回有效内容' });
    }

    // 清理可能的 markdown 标记并解析 JSON
    const cleanJsonStr = textResult.replace(/```json\n?|```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonStr);

    return res.status(200).json(parsedData);

  } catch (err) {
    console.error("Server Error:", err);
    // 详细返回本地报错
    return res.status(500).json({ error: `后端处理失败: ${err.message}` });
  }
}
