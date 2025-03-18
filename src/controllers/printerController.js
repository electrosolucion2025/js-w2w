import Business from '../models/business.js';
import Category from '../models/category.js';
import PrinterDevice from '../models/printerDevice.js';
import PrinterZone from '../models/printerZone.js';
import PrintTicket from '../models/printTicket.js';
import { sendTicketToPrinter } from '../services/printerService.js';

// Controlador para zonas de impresoras
export const createPrinterZone = async (req, res) => {
  try {
    const { businessId, name, printerIp, printerPort, active, categoryIds } = req.body;

    // Verificar que el negocio existe
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    // Verificar si ya existe una zona con el mismo nombre en este negocio
    const existingZone = await PrinterZone.findOne({ businessId, name });
    if (existingZone) {
      return res.status(400).json({ error: `Ya existe una zona llamada "${name}" en este negocio` });
    }

    // Si se proporcionaron categorías, verificar que existan
    if (categoryIds && categoryIds.length > 0) {
      const categoryCount = await Category.countDocuments({
        _id: { $in: categoryIds },
        businessId: businessId
      });

      if (categoryCount !== categoryIds.length) {
        return res.status(400).json({
          error: 'Una o más categorías no existen o no pertenecen a este negocio'
        });
      }
    }

    // Crear la zona de impresión
    const printerZone = new PrinterZone({
      businessId,
      name,
      printerIp,
      printerPort: printerPort || 9100,
      active: active !== undefined ? active : true,
      categoryIds: categoryIds || []
    });

    await printerZone.save();

    res.status(201).json(printerZone);
  } catch (error) {
    console.error('Error al crear zona de impresión:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPrinterZones = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Verificar que el negocio existe
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    // Buscar zonas y poblar las categorías
    const printerZones = await PrinterZone.find({ businessId })
      .populate('categoryIds', 'name description'); // Traer solo name y description de cada categoría

    res.status(200).json(printerZones);
  } catch (error) {
    console.error('Error al obtener zonas de impresión:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePrinterZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, printerIp, printerPort, active, categoryIds } = req.body;

    const printerZone = await PrinterZone.findById(id);
    if (!printerZone) {
      return res.status(404).json({ error: 'Zona de impresión no encontrada' });
    }

    // Si se actualizan las categorías, verificar que existan
    if (categoryIds && categoryIds.length > 0) {
      const categoryCount = await Category.countDocuments({
        _id: { $in: categoryIds },
        businessId: printerZone.businessId
      });

      if (categoryCount !== categoryIds.length) {
        return res.status(400).json({
          error: 'Una o más categorías no existen o no pertenecen a este negocio'
        });
      }

      printerZone.categoryIds = categoryIds;
    }

    // Actualizar campos
    if (name !== undefined) printerZone.name = name;
    if (printerIp !== undefined) printerZone.printerIp = printerIp;
    if (printerPort !== undefined) printerZone.printerPort = printerPort;
    if (active !== undefined) printerZone.active = active;

    printerZone.updatedAt = new Date();

    await printerZone.save();

    res.status(200).json(printerZone);
  } catch (error) {
    console.error('Error al actualizar zona de impresión:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deletePrinterZone = async (req, res) => {
  try {
    const { id } = req.params;

    const printerZone = await PrinterZone.findById(id);
    if (!printerZone) {
      return res.status(404).json({ error: 'Zona de impresión no encontrada' });
    }

    // Verificar si hay tickets pendientes para esta zona
    const pendingTickets = await PrintTicket.countDocuments({
      printerZoneId: id,
      status: 'PENDING'
    });

    if (pendingTickets > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar esta zona porque tiene tickets pendientes',
        pendingTickets
      });
    }

    await printerZone.deleteOne();

    res.status(200).json({ message: 'Zona de impresión eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar zona de impresión:', error);
    res.status(500).json({ error: error.message });
  }
};

// Controladores para tickets de impresión
export const getPendingTickets = async (req, res) => {
  try {
    const { printerZoneId } = req.params;

    const printerZone = await PrinterZone.findById(printerZoneId);
    if (!printerZone) {
      return res.status(404).json({ error: 'Zona de impresión no encontrada' });
    }

    const pendingTickets = await PrintTicket.find({
      printerZoneId,
      status: 'PENDING'
    }).sort({ createdAt: 1 }); // Primero los más antiguos

    // No enviamos el contenido completo del ticket por API para ahorrar ancho de banda
    const ticketSummary = pendingTickets.map(ticket => ({
      id: ticket._id,
      orderId: ticket.orderId,
      status: ticket.status,
      createdAt: ticket.createdAt,
      contentAvailable: ticket.content ? true : false
    }));

    res.status(200).json(ticketSummary);
  } catch (error) {
    console.error('Error al obtener tickets pendientes:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getTicketContent = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await PrintTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    if (!ticket.content) {
      return res.status(404).json({ error: 'Contenido del ticket no disponible' });
    }

    // Enviar el contenido como buffer binario
    res.set('Content-Type', 'application/octet-stream');
    res.send(ticket.content);
  } catch (error) {
    console.error('Error al obtener contenido del ticket:', error);
    res.status(500).json({ error: error.message });
  }
};

export const markTicketAsPrinted = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await PrintTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    ticket.status = 'PRINTED';
    ticket.updatedAt = new Date();

    await ticket.save();

    res.status(200).json({ message: 'Ticket marcado como impreso correctamente' });
  } catch (error) {
    console.error('Error al marcar ticket como impreso:', error);
    res.status(500).json({ error: error.message });
  }
};

export const retryFailedTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await PrintTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    if (ticket.status !== 'FAILED') {
      return res.status(400).json({ error: 'Solo se pueden reintentar tickets con estado FAILED' });
    }

    // Intentar enviar a la impresora
    await sendTicketToPrinter(ticketId);

    res.status(200).json({ message: 'Ticket enviado a impresora correctamente' });
  } catch (error) {
    console.error('Error al reintentar ticket fallido:', error);
    res.status(500).json({ error: error.message });
  }
};

// Registrar un dispositivo ESP32 y asignarle impresoras

const sanitizeConnectionHistory = async (deviceId) => {
  try {
    // Recuperar el dispositivo directamente de la base de datos
    const device = await PrinterDevice.findOne({ deviceId }).lean();
    if (!device || !device.connectionHistory || !Array.isArray(device.connectionHistory)) {
      return;
    }

    // Corregir entradas de historial que no tengan status
    let needsUpdate = false;
    const updatedHistory = device.connectionHistory.map(entry => {
      if (!entry.status) {
        needsUpdate = true;
        return {
          ...entry,
          status: 'unknown', // Asignar un valor por defecto
          timestamp: entry.timestamp || new Date()
        };
      }
      return entry;
    });

    if (needsUpdate) {
      // Actualizar directamente con updateOne para evitar validaciones intermedias
      await PrinterDevice.updateOne(
        { deviceId },
        { $set: { connectionHistory: updatedHistory } }
      );
      console.log(`Historial de conexión corregido para dispositivo ${deviceId}`);
    }
  } catch (err) {
    console.error(`Error al sanitizar historial de conexión: ${err.message}`);
  }
};

export const registerPrinterDevice = async (req, res) => {
  try {
    const { deviceId, businessCode, ipAddress, macAddress, firmwareVersion } = req.body;

    if (!deviceId || !businessCode) {
      return res.status(400).json({ error: 'Se requiere deviceId y businessCode' });
    }

    // Sanitizar historial de conexión existente antes de cualquier operación
    await sanitizeConnectionHistory(deviceId);

    // Buscar el negocio por código
    const business = await Business.findOne({ code: businessCode });
    if (!business) {
      return res.status(404).json({ error: `Negocio no encontrado con código ${businessCode}` });
    }

    // Buscar o crear el registro del dispositivo
    let printerDevice = await PrinterDevice.findOne({ deviceId });

    if (!printerDevice) {
      printerDevice = new PrinterDevice({
        deviceId,
        businessId: business._id,
        ipAddress,
        macAddress,
        firmwareVersion,
        lastSeen: new Date(),
        // Inicializar con un estado de conexión válido
        online: true,
        isOnline: true,
        connectionHistory: [{
          timestamp: new Date(),
          status: 'connected', // Importante: añadir el status
          details: 'Registro inicial del dispositivo'
        }]
      });
    } else {
      // Intentar resetear el historial de conexión si está causando problemas
      if (printerDevice.connectionHistory &&
        printerDevice.connectionHistory.some(entry => !entry.status)) {
        printerDevice.connectionHistory = [{
          timestamp: new Date(),
          status: 'connected',
          details: 'Historial reiniciado por problemas de validación'
        }];
      }

      // Actualizar datos del dispositivo existente
      printerDevice.ipAddress = ipAddress;
      printerDevice.lastSeen = new Date();
      printerDevice.online = true;
      printerDevice.isOnline = true;
      if (firmwareVersion) printerDevice.firmwareVersion = firmwareVersion;
      if (macAddress) printerDevice.macAddress = macAddress;

      // Registrar el evento de conexión de forma segura
      try {
        if (!printerDevice.connectionHistory) printerDevice.connectionHistory = [];
        printerDevice.connectionHistory.push({
          timestamp: new Date(),
          status: 'connected',  // Asegurar que status está presente
          details: 'Dispositivo reconectado'
        });
      } catch (err) {
        console.warn('Error al actualizar historial de conexión:', err);
        // Resetear el historial si hay problemas
        printerDevice.connectionHistory = [{
          timestamp: new Date(),
          status: 'connected',
          details: 'Historial reiniciado por error'
        }];
      }
    }

    // Asegurar que se guarde con las opciones adecuadas para pasar la validación
    await printerDevice.save({ validateBeforeSave: true });

    // Obtener todas las zonas de impresión activas para este negocio
    const printerZones = await PrinterZone.find({
      businessId: business._id,
      active: true
    }).populate('categoryIds', 'name'); // Poblar información de categorías

    // Formatear la configuración para el dispositivo
    const printers = printerZones.map(zone => ({
      zoneId: zone._id,
      name: zone.name,
      printerIp: zone.printerIp,
      printerPort: zone.printerPort,
      categoryIds: zone.categoryIds.map(cat => ({
        id: cat._id,
        name: cat.name
      }))
    }));

    // Devolver la configuración al dispositivo
    res.status(200).json({
      success: true,
      deviceId,
      businessId: business._id.toString(),
      businessName: business.name,
      printers: printers,
      checkInterval: 5000 // Intervalo de comprobación en milisegundos
    });

  } catch (error) {
    console.error('Error registrando dispositivo de impresión:', error);
    res.status(500).json({ error: error.message });
  }
};

// Añadir este endpoint
export const getPrinterStatus = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Verificar que el negocio existe
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    // Obtener todas las zonas de impresión
    const printerZones = await PrinterZone.find({ businessId });

    // Obtener todos los dispositivos
    const printerDevices = await PrinterDevice.find({ businessId });

    // Agrupar dispositivos por IP
    const devicesByIp = {};
    printerDevices.forEach(device => {
      if (!devicesByIp[device.printerIp]) {
        devicesByIp[device.printerIp] = [];
      }
      devicesByIp[device.printerIp].push({
        deviceId: device.deviceId,
        name: device.name || device.deviceId,
        online: device.online,
        lastSeen: device.lastSeen,
        macAddress: device.macAddress
      });
    });

    // Combinar información de zonas y dispositivos
    const printerStatus = printerZones.map(zone => ({
      zoneId: zone._id,
      zoneName: zone.name,
      printerIp: zone.printerIp,
      printerPort: zone.printerPort,
      active: zone.active,
      devices: devicesByIp[zone.printerIp] || [],
      // Una zona está online si al menos un dispositivo con su IP está online
      online: devicesByIp[zone.printerIp] ?
        devicesByIp[zone.printerIp].some(d => d.online) : false
    }));

    res.status(200).json({
      business: {
        id: business._id,
        name: business.name
      },
      printers: printerStatus
    });

  } catch (error) {
    console.error('Error al obtener estado de impresoras:', error);
    res.status(500).json({ error: error.message });
  }
};

// Endpoint para ver el historial de conexión de una impresora específica
export const getPrinterConnectionHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await PrinterDevice.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    res.status(200).json({
      deviceId: device.deviceId,
      printerIp: device.printerIp,
      online: device.online,
      lastSeen: device.lastSeen,
      connectionHistory: device.connectionHistory || []
    });

  } catch (error) {
    console.error('Error al obtener historial de conexión:', error);
    res.status(500).json({ error: error.message });
  }
};

// Verificar el estado de una impresora específica
export const checkPrinterStatus = async (req, res) => {
  try {
    const { printerIp } = req.params;

    // Intentar conectar a la impresora
    const isOnline = await checkPrinterConnection(printerIp);

    // Actualizar el estado en la base de datos
    await updatePrinterStatus(printerIp, isOnline);

    // Obtener los dispositivos actualizados
    const PrinterDevice = mongoose.model('PrinterDevice');
    const devices = await PrinterDevice.find({ printerIp });

    res.status(200).json({
      printerIp,
      online: isOnline,
      devices: devices.map(d => ({
        deviceId: d.deviceId,
        online: d.online,
        lastSeen: d.lastSeen,
        historyCount: d.connectionHistory ? d.connectionHistory.length : 0
      }))
    });
  } catch (error) {
    console.error(`Error al verificar impresora ${req.params.printerIp}:`, error);
    res.status(500).json({ error: error.message });
  }
};

export default PrinterDevice;