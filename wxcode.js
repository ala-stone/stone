/*
[Script]
# Code提取+URL替换+自动上传服务器 - Surge/QX通用
# 配置类型：rewrite_remote / script-request
# 拦截域名：gate-obt.nqf.qq.com
[rewrite_local]
^https:\/\/gate-obt\.nqf\.qq\.com url script-request code_extract_upload.js
*/

// ====================== 你需要修改的配置 ======================
const API_URL = "http://192.168.5.28:3000/api/accounts"; // 服务器接口地址
const PASSWORD = "admin";                 // 服务器登录密码
const LOCAL_DOMAIN = "http://127.0.0.1";             // 替换后的本地域名（可改）
// =============================================================

// 核心逻辑：拦截URL、替换域名、提取code、上传服务器
if ($request && $request.url) {
    // 1. 原始URL处理：替换域名
    const originalUrl = $request.url;
    const newUrl = originalUrl.replace("https://gate-obt.nqf.qq.com", LOCAL_DOMAIN);

    // 2. 提取code参数（容错处理）
    let code = "未提取到code";
    const codeMatch = newUrl.match(/code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
        code = codeMatch[1];
        console.log(`✅ 成功提取code：${code}`);
        
        // 3. 提取uin（QQ号，用于关联账号，可选但建议保留）
        let uin = "未提取到uin";
        const uinMatch = newUrl.match(/uin=(\d+)/) || originalUrl.match(/(\d{5,})/);
        if (uinMatch && uinMatch[1]) {
            uin = uinMatch[1];
            console.log(`✅ 成功提取uin：${uin}`);
        }

        // 4. 上传code到服务器（核心逻辑）
        uploadCodeToServer(code, uin);
    } else {
        console.log("❌ URL中未找到code参数");
        $notify("拦截成功", "code提取失败", "URL中无code参数");
    }

    // 5. 返回修改后的URL（继续请求到本地）
    $done({ url: newUrl });
} else {
    console.log("⚠️ 无有效请求对象，直接放行");
    $done({});
}

// 封装：上传code到服务器的函数
function uploadCodeToServer(code, uin) {
    // 第一步：登录服务器获取token
    $task.fetch({
        url: API_URL.replace("/accounts", "/login"), // 登录接口（根据你的后台调整）
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: PASSWORD })
    }).then(loginRes => {
        try {
            const loginResult = JSON.parse(loginRes.body);
            // 登录失败处理
            if (!loginResult.ok || !loginResult.data?.token) {
                throw new Error("登录失败：" + (loginResult.msg || "未知错误"));
            }
            const token = loginResult.data.token;
            console.log("✅ 服务器登录成功，获取token：" + token.substring(0, 10) + "...");

            // 第二步：查询账号是否存在（根据uin匹配）
            $task.fetch({
                url: API_URL,
                headers: { "x-admin-token": token }
            }).then(accRes => {
                const accData = JSON.parse(accRes.body);
                const accounts = accData.data?.accounts || [];
                const targetAccount = accounts.find(acc => acc.name === uin || acc.uin === uin);

                if (targetAccount) {
                    // 情况1：账号存在 → 更新code
                    if (targetAccount.code !== code) {
                        updateAccountCode(token, targetAccount.id, code, uin);
                    } else {
                        console.log(`✅ 账号${uin}的code未变化，无需更新`);
                        $notify("上传成功", `账号${uin}`, "code未变化，无需更新");
                    }
                } else {
                    // 情况2：账号不存在 → 新建账号
                    createNewAccount(token, code, uin);
                }
            }).catch(err => {
                throw new Error("查询账号失败：" + err.message);
            });
        } catch (e) {
            console.log("❌ 登录/解析失败：" + e.message);
            $notify("上传失败", "服务器登录失败", e.message);
        }
    }).catch(err => {
        console.log("❌ 请求登录接口失败：" + err.message);
        $notify("上传失败", "连接服务器失败", "请检查接口地址是否正确");
    });
}

// 封装：更新已有账号的code
function updateAccountCode(token, accountId, code, uin) {
    $task.fetch({
        url: API_URL,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin-token": token
        },
        body: JSON.stringify({
            id: accountId,
            code: code
        })
    }).then(res => {
        console.log(`✅ 账号${uin}的code已更新`);
        $notify("上传成功", `账号${uin}`, "code已更新到服务器");
    }).catch(err => {
        console.log("❌ 更新code失败：" + err.message);
        $notify("上传失败", `账号${uin}`, "更新code失败");
    });
}

// 封装：新建账号并上传code
function createNewAccount(token, code, uin) {
    $task.fetch({
        url: API_URL,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin-token": token
        },
        body: JSON.stringify({
            name: uin,
            uin: uin,
            qq: uin,
            platform: "qq",
            loginType: "manual",
            code: code
        })
    }).then(res => {
        console.log(`✅ 新建账号${uin}并上传code成功`);
        $notify("上传成功", `新账号${uin}`, "已创建并上传code");
    }).catch(err => {
        console.log("❌ 新建账号失败：" + err.message);
        $notify("上传失败", `新账号${uin}`, "创建账号失败");
    });
}
