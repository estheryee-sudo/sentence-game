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

    // 备用模型池：优先请求 3.8-flash，如果拥堵自动降级到 3.5-flash-lite / 3.6-flash
    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash'
    ];

    let lastError = null;
    let data = null;

    // 轮询尝试可用模型
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
        break; // 请求成功，跳出循环
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

    // 提取生成的文本内容
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      return res.status(500).json({ error: 'AI 未返回有效内容' });
    }

    // 清理 markdown 标记并解析 JSON
    const cleanJsonStr = textResult.replace(/```json\n?|```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonStr);

    return res.status(200).json(parsedData);

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: `后端处理失败: ${err.message}` });
  }
}
