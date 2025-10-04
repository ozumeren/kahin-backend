// src/controllers/user.controller.js
class UserController {
  getMe(req, res) {
    // Middleware, req.user içine kullanıcı bilgilerini zaten koymuştu.
    const currentUser = req.user;
    currentUser.password = undefined; // Güvenlik için şifreyi yanıttan kaldır

    res.status(200).json(currentUser);
  }
}
module.exports = new UserController();