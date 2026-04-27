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

        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 读取流并转发
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // 智谱返回的是标准的 SSE 格式，直接转发
                res.write(chunk);
            }
        } finally {
            res.end();
        }
    } catch (error) {
        console.error('代理错误:', error);
        // 如果还没开始写响应头，返回 JSON 错误；否则已经写了头就无法改了
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.end();
    }
}
