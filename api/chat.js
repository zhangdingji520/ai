export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持 POST 请求' });
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: '消息不能为空' });
    }

    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
        console.error('ZHIPU_API_KEY 环境变量未设置');
        return res.status(500).json({ error: '服务器配置错误' });
    }

    try {
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'glm-4-flash',
                messages: [{ role: 'user', content: message }],
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('智谱 API 错误:', errorData);
            return res.status(response.status).json({ error: errorData.error?.message || '调用智谱 API 失败' });
        }

        // 设置 SSE 响应头（前端需要用 EventSource 或 fetch 的 reader）
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const chunk = JSON.parse(jsonStr);
                        const content = chunk.choices?.[0]?.delta?.content;
                        if (content) {
                            // 直接发送纯文本块（每块一个 data: ，结尾两个换行）
                            res.write(`data: ${content}\n\n`);
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
        res.end();
    } catch (error) {
        console.error('代理错误:', error);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.end();
    }
}
