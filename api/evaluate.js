export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  const { action, sentence, level, keywords, challenge } = req.body;
  const API_KEY = process.env.AI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: '环境变量未配置 AI_API_KEY，请在 Vercel 后台添加！' });
  }

  try {
    if (action === 'generate_question') {
      const prompt = `你是一个中小学语文名师。请为难度等级【${level}】动态生成一组造句练习题。
要求：
1. 生成 2-3 个符合该学段水平的关键词（包含常识词、成语或科技词汇）。
2. 生成一个附加挑战（如指定句式、修辞手法或篇幅限制）。
3. 严格返回 JSON 格式，不得包含任何 Markdown 格式或额外文本：
{"keywords": ["词1", "词2"], "challenge": "附加挑战描述"}`;

      const aiResponseText = await callAI(prompt, API_KEY);
      const cleanedJSON = cleanJSONString(aiResponseText);
      return res.status(200).json(JSON.parse(cleanedJSON));
    }

    if (action === 'evaluate_sentence') {
      const prompt = `你是一个严格且温和的语文评估专家。
请评估学生造句：
- 学生造句：“${sentence}”
- 难度等级：${level}
- 必须包含词语：${keywords ? keywords.join('、') : ''}
- 附加要求：${challenge || '无'}

评估与扣分规则：
1. 涉及暴力色情、不良引导直接判定 0 分。
2. 滥用网络流行梗/不规范华语（如“绝绝子”等）扣 2 分。
3. 错别字、标点误用每处扣 1 分。
4. 语病/成分残缺扣 2 分。
5. 未满足附加挑战扣 2 分。

请严格返回 JSON 格式，不得包含任何 Markdown 格式或额外文本：
{
  "score": 8,
  "metrics": { "syntax": 80, "vocab": 85, "logic": 90, "rhetoric": 75 },
  "deductions": ["扣分原因1（若无则填空数组）"],
  "suggestions": "具体的修改建议与优点点评",
  "exemplar": "优化后的满分示范例句",
  "hints": [
    "微调方向A：简单补全缺失的句式",
    "微调方向B：替换网络梗，升华文章意境",
    "微调方向C（框架）：填空模版..."
  ]
}`;

      const aiResponseText = await callAI(prompt, API_KEY);
      const cleanedJSON = cleanJSONString(aiResponseText);
      return res.status(200).json(JSON.parse(cleanedJSON));
    }

    return res.status(400).json({ error: '未知 action 参数' });

  } catch (error) {
    console.error('API 处理错误:', error);
    return res.status(500).json({ error: 'AI 服务响应异常，请重试' });
  }
}

async function callAI(promptText, apiKey) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: promptText }]
    })
  });

  if (!response.ok) {
    throw new Error(`API 接口返回错误: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function cleanJSONString(str) {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
}
