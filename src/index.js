import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const app = new Hono();

// Redirect root to admin login
app.get('/', (c) => c.redirect('/admin/login'));

// Auth Middleware for /admin/*
app.use('/admin/*', async (c, next) => {
  if (c.req.path === '/admin/login' || c.req.path === '/admin/login/submit') {
    return await next();
  }
  const token = getCookie(c, 'admin_session');
  // Simple check, in real world use a better signed session token
  if (token !== 'authenticated') {
    return c.redirect('/admin/login');
  }
  await next();
});

// Admin Login Page
app.get('/admin/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>登录 - 浮窗管理系统</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: system-ui, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 320px; }
        h2 { text-align: center; color: #333; margin-top: 0; }
        .form-group { margin-bottom: 20px; }
        input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #1677ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0958d9; }
        .error { color: red; font-size: 14px; text-align: center; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h2>浮窗后台管理系统</h2>
        ${c.req.query('error') ? '<div class="error">密码错误！</div>' : ''}
        <form action="/admin/login/submit" method="post">
          <div class="form-group">
            <input type="password" name="password" placeholder="请输入管理员密码" required>
          </div>
          <button type="submit">登录</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/login/submit', async (c) => {
  const body = await c.req.parseBody();
  const password = body.password;

  if (password === c.env.ADMIN_PASSWORD) {
    setCookie(c, 'admin_session', 'authenticated', {
      path: '/',
      secure: true,
      httpOnly: true,
      maxAge: 60 * 60 * 24 // 1 day
    });
    return c.redirect('/admin');
  } else {
    return c.redirect('/admin/login?error=1');
  }
});

app.get('/admin/logout', (c) => {
  deleteCookie(c, 'admin_session', { path: '/' });
  return c.redirect('/admin/login');
});

// Admin Dashboard
app.get('/admin', async (c) => {
  const db = c.env.DB;

  // Auto-initialize schema if it doesn't exist
  await db.prepare(`CREATE TABLE IF NOT EXISTS float_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon_url TEXT NOT NULL,
        target_url TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

  // Fetch overview stats
  const statsQuery = await db.prepare('SELECT SUM(views) as totalViews, SUM(clicks) as totalClicks, count(*) as totalCount FROM float_configs').first();
  const totalViews = statsQuery?.totalViews || 0;
  const totalClicks = statsQuery?.totalClicks || 0;
  const totalCount = statsQuery?.totalCount || 0;

  // Fetch list
  const { results: list } = await db.prepare('SELECT * FROM float_configs ORDER BY created_at DESC').all();

  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>仪表盘 - 浮窗管理系统</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .stat-card h3 { margin: 0 0 10px 0; color: #666; font-size: 16px; }
        .stat-card .value { font-size: 32px; font-weight: bold; color: #1677ff; }
        
        .panel { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 30px; }
        .panel h2 { margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        
        .form-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
        .form-row input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;}
        .btn { padding: 8px 16px; background: #1677ff; color: white; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block;}
        .btn:hover { background: #0958d9; }
        .btn-danger { background: #ff4d4f; }
        .btn-danger:hover { background: #cf1322; }

        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; word-break: break-all; }
        th { background: #fafafa; font-weight: 500; }
        .code-box { background: #f5f5f5; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; }
        .icon-preview { width: 40px; height: 40px; object-fit: contain; border-radius: 4px; border: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>浮窗管理系统</h1>
          <a href="/admin/logout" class="btn btn-danger">退出登录</a>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <h3>总展示次数</h3>
            <div class="value">${totalViews}</div>
          </div>
          <div class="stat-card">
            <h3>总点击次数</h3>
            <div class="value">${totalClicks}</div>
          </div>
          <div class="stat-card">
            <h3>浮窗数量</h3>
            <div class="value">${totalCount}</div>
          </div>
        </div>

        <div class="panel">
          <h2>添加新浮窗</h2>
          <form action="/admin/create" method="post">
            <div class="form-row">
              <input type="text" name="name" placeholder="浮窗名称 (例如：首页引导)" required>
              <input type="url" name="icon_url" placeholder="图标图片URL" required>
              <input type="url" name="target_url" placeholder="点击跳转的URL" required>
              <button type="submit" class="btn">新增</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <h2>浮窗列表</h2>
          <div style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>图标预览</th>
                  <th>跳转链接</th>
                  <th>展示数</th>
                  <th>点击数</th>
                  <th>引用代码</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${list.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:#999;">暂无数据</td></tr>' : ''}
                ${list.map(item => `
                  <tr>
                    <td>${item.id}</td>
                    <td>${item.name}</td>
                    <td><img src="${item.icon_url}" class="icon-preview" alt="icon"></td>
                    <td><a href="${item.target_url}" target="_blank">${item.target_url}</a></td>
                    <td><strong>${item.views}</strong></td>
                    <td><strong>${item.clicks}</strong></td>
                    <td>
                      <div class="code-box">&lt;script src="${new URL(c.req.url).origin}/js/${item.id}"&gt;&lt;/script&gt;</div>
                    </td>
                    <td>
                      <form action="/admin/delete/${item.id}" method="post" onsubmit="return confirm('确定要删除吗？数据将不可恢复！');">
                        <button type="submit" class="btn btn-danger" style="padding: 4px 8px; font-size: 13px;">删除</button>
                      </form>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Admin Create Config
app.post('/admin/create', async (c) => {
  const body = await c.req.parseBody();
  const db = c.env.DB;
  await db.prepare('INSERT INTO float_configs (name, icon_url, target_url) VALUES (?, ?, ?)')
    .bind(body.name, body.icon_url, body.target_url)
    .run();

  return c.redirect('/admin');
});

// Admin Delete Config
app.post('/admin/delete/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare('DELETE FROM float_configs WHERE id = ?').bind(id).run();
  return c.redirect('/admin');
});

// JS Service Endpoint
app.get('/js/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  // Fetch config
  const config = await db.prepare('SELECT * FROM float_configs WHERE id = ?').bind(id).first();

  if (!config) {
    return c.text('console.error("Floating button config not found.");', 404);
  }

  // Record view asynchronously using executionContext so it doesn't block response
  // Unfortunately for sqlite D1 it's quite fast anyway
  try {
    await db.prepare('UPDATE float_configs SET views = views + 1 WHERE id = ?').bind(id).run();
  } catch (e) {
    console.error("Error updating views", e);
  }

  const originUrl = new URL(c.req.url).origin;
  const clickEndpoint = `${originUrl}/click/${id}`;

  const jsCode = `
(function() {
    // 1. 动态注入 CSS 样式
    const css = \`
        #dynamic-floating-btn-${id} {
            position: fixed;
            width: 110px;
            height: 110px;
            right: 10px;
            top: 100px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 22px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            cursor: pointer;
            user-select: none;
            touch-action: none;
            transition: opacity 0.3s, transform 0.3s;
            overflow: hidden;
            border: 1px solid rgba(0,0,0,0.05);
        }
        #dynamic-floating-btn-${id} .float-icon {
            width: 70%;
            height: 70%;
            object-fit: contain;
            pointer-events: none;
        }
        #dynamic-floating-btn-${id}.is-hidden {
            opacity: 0.5;
            transform: scale(0.9);
        }
    \`;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    document.head.appendChild(style);

    // 2. 动态注入 HTML 结构
    const btn = document.createElement('div');
    btn.id = 'dynamic-floating-btn-${id}';
    
    const imageUrl = "${config.icon_url}";
    const trackClickUrl = "${clickEndpoint}";

    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'float-icon';
    btn.appendChild(img);

    document.body.appendChild(btn);

    // 3. 拖拽与点击交互逻辑
    let isDragging = false;
    let startX, startY; 
    let initialX, initialY; 
    let moveX, moveY; 
    
    const dragThreshold = 8;
    let hasMoved = false;

    function getBtnPos() {
        const rect = btn.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    }

    const onStart = (e) => {
        isDragging = true;
        hasMoved = false;
        btn.style.transition = 'none'; 
        btn.classList.remove('is-hidden');

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        
        const pos = getBtnPos();
        initialX = pos.x;
        initialY = pos.y;
    };

    const onMove = (e) => {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentClientY = e.touches ? e.touches[0].clientY : e.clientY;

        moveX = clientX - startX;
        moveY = currentClientY - startY;

        if (Math.abs(moveX) > dragThreshold || Math.abs(moveY) > dragThreshold) {
            hasMoved = true;
            if (e.cancelable) {
                 e.preventDefault(); 
            }
        }

        let newX = initialX + moveX;
        let newY = initialY + moveY;

        const maxX = window.innerWidth - btn.offsetWidth;
        const maxY = window.innerHeight - btn.offsetHeight;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        btn.style.left = newX + 'px';
        btn.style.top = newY + 'px';
        btn.style.right = 'auto'; 
    };

    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        if (!hasMoved) {
            window.location.href = trackClickUrl;
            return;
        }

        snapToEdge();
    };

    function snapToEdge() {
        const rect = btn.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const btnWidth = btn.offsetWidth;
        
        const middle = screenWidth / 2;
        const currentX = rect.left + btnWidth / 2;

        btn.style.transition = 'all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        
        if (currentX < middle) {
            btn.style.left = \`-\${btnWidth * 0.4}px\`;
        } else {
            btn.style.left = \`\${screenWidth - btnWidth * 0.6}px\`;
        }
        
        setTimeout(() => {
            btn.classList.add('is-hidden');
        }, 300);
    }

    btn.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    btn.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);

    const initSnap = () => {
        setTimeout(snapToEdge, 500);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSnap();
    } else {
        window.addEventListener('load', initSnap);
    }

    window.addEventListener('resize', snapToEdge);

})();
`;

  return c.text(jsCode, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
});

// Click Tracking and Redirect Endpoint
app.get('/click/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  // Fetch config
  const config = await db.prepare('SELECT target_url FROM float_configs WHERE id = ?').bind(id).first();

  if (!config) {
    return c.text('Target not found', 404);
  }

  // Record click
  try {
    await db.prepare('UPDATE float_configs SET clicks = clicks + 1 WHERE id = ?').bind(id).run();
  } catch (e) {
    console.error("Error updating clicks", e);
  }

  // Redirect to final destination
  return c.redirect(config.target_url, 302);
});

export default app;
