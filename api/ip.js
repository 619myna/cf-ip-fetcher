module.exports = (req, res) => {
  try {
    // 故意测试：返回静态内容
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello from Vercel!');
  } catch (error) {
    // 如果发生错误，将错误信息返回给客户端
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Internal Error: ' + error.message + '\n' + error.stack);
  }
};
