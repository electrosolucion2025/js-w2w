import express from 'express';
import BusinessController from '../controllers/businessController.js';
import MenuController from '../controllers/menuController.js';
import { renderPaymentForm } from '../controllers/paymentController.js';
import * as printerController from '../controllers/printerController.js';
import * as redsysController from '../controllers/redsysController.js';
import UserController from '../controllers/userController.js';
import WebhookController from '../controllers/webhookController.js';
import orderRoutes from './orderRoutes.js';
import promotionRoutes from './promotionRoutes.js';

const router = express.Router();
const webhookController = new WebhookController();
const userController = new UserController();
const businessController = new BusinessController();
const menuController = new MenuController();

const setRoutes = (app) => {
  router.post('/webhook', webhookController.webhook);
  router.get('/webhook', webhookController.verifyWebhook);

  // Rutas para usuarios
  router.post('/users', userController.createUser);
  router.get('/users/:whatsappNumber', userController.getUsers);

  // Rutas para negocios
  router.post('/business', businessController.createBusiness);
  router.get('/business/:code', businessController.getBusiness);

  // Ruta para subir el menú
  router.post('/menu', menuController.uploadMenu);

  // Rutas para pagos y Redsys
  router.get('/pay/:orderId', renderPaymentForm);
  router.post('/redsys/notify', redsysController.notify);
  router.get('/redsys/success', redsysController.success);
  router.get('/redsys/failure', redsysController.failure);

  // Nuevas rutas para zonas de impresión
  router.post('/printer-zones', printerController.createPrinterZone);
  router.get('/printer-zones/business/:businessId', printerController.getPrinterZones);
  router.put('/printer-zones/:id', printerController.updatePrinterZone);
  router.delete('/printer-zones/:id', printerController.deletePrinterZone);

  // Rutas para tickets de impresión
  router.get('/printer-tickets/pending/:printerZoneId', printerController.getPendingTickets);
  router.get('/printer-tickets/content/:ticketId', printerController.getTicketContent);
  router.post('/printer-tickets/:ticketId/mark-printed', printerController.markTicketAsPrinted);
  router.post('/printer-tickets/:ticketId/retry', printerController.retryFailedTicket);
  router.post('/printer-devices/register', printerController.registerPrinterDevice);

  // Nuevas rutas para el estado de las impresoras
  router.get('/status/:businessId', printerController.getPrinterStatus);
  router.get('/history/:deviceId', printerController.getPrinterConnectionHistory);
  router.get('/check/:printerIp', printerController.checkPrinterStatus);

  app.use('/api', router);

  // Rutas de promociones
  app.use('/api/promotions', promotionRoutes);

  // Rutas de pedidos
  app.use('/orders', orderRoutes);
};

export default setRoutes;