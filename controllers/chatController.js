const express = require('express');
const chatRouter = express.Router();
const chatService = require('../services/chatService');
const fs = require('fs');
const path = require('path');



chatRouter.get("/getChat/:id", async (req, res, next) => {
  await chatService.getChat(req, res, next);
});

chatRouter.post("/createChat", async (req, res, next) => {
  await chatService.saveChat(req, res, next);
});

chatRouter.post("/getChatId", async (req, res, next) => {
  console.log('getChatId', req.body);
  await chatService.getChatId(req, res, next);
});


chatRouter.post("/updateChat", async (req, res, next) => {
  await chatService.updateChat(req, res, next);
});
chatRouter.post("/setChatUpdateRead", async (req, res, next) => {
  await chatService.setChatUpdateRead(req, res, next);
});
chatRouter.post("/getChatsForUser", async (req, res, next) => {
  await chatService.getChatsForUser(req, res, next);
});
chatRouter.post("/getUnreadCount", async (req, res, next) => {
  await chatService.getUnreadCount(req, res, next);
});
chatRouter.post("/updateUnread", async (req, res, next) => {
  await chatService.updateUnread(req, res, next);
});
chatRouter.post("/getChatsForProduct", async (req, res, next) => {
  await chatService.getChatsForProduct(req, res, next);
});


module.exports = chatRouter;