import generateGeminiResponse from './googleGeminiService.js';
import { createOrder } from './orderService.js';
import { applyFirstBuyCoffeePromotion, checkFirstBuyCoffeePromotion, useFirstBuyCoffeePromotion } from './promotionService.js';

/**
 * Maneja la respuesta del menú basada en el mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Object} menuJSON - JSON del menú
 * @param {string} defaultPrompt - Prompt predeterminado
 * @param {Array} fullHistory - Historial completo de la conversación
 * @param {string} userId - ID del usuario
 * @param {string} businessId - ID del negocio
 * @param {string} tableNumber - Número de mesa
 * @param {string} detectedLanguage - Idioma detectado en el mensaje
 * @returns {Promise<string>} - Respuesta al usuario
 */
export const handleMenuResponse = async (
  message,
  menuJSON,
  defaultPrompt,
  fullHistory,
  userId,
  businessId,
  tableNumber,
  detectedLanguage
) => {
  try {
    // Verificar si el usuario tiene acceso a la promoción de café gratis
    const promotionInfo = await checkFirstBuyCoffeePromotion(userId, businessId);

    // Modificar el prompt del sistema para incluir información sobre la promoción
    let modifiedPrompt = defaultPrompt;

    if (promotionInfo.available) {
      // Lista de cafés disponibles para la promoción
      const coffeeList = promotionInfo.eligibleProducts.map(p =>
        `- ${p.name} (Normally ${p.price.toFixed(2)}€)`
      ).join('\n');

      // Añadir información de la promoción al prompt
      const promotionText = `
      SPECIAL PROMOTION:
      As it is your first purchase, you are entitled to a FREE coffee when purchasing any other product.
      You can choose one of these coffees:
      ${coffeeList}
      
      [PROMOTION RULES]:
      1. Offer the promotion only once in the conversation. At the beginning for example. If the client rejects or ignores it, do not insist.
      2. If the customer asks to finish the order, or you think they want to finish and they haven't chosen a coffee, ask them one last time. If he ignores you or wants to finish without coffee, don't offer him coffee again.
      3. If the customer orders a coffee that is within those valid for the promotion (${coffeeList}) you apply the promotion.
      4. Promotion valid only for one (1) coffee. If the customer orders more than one, charge them.
      5. Promotion requires a minimum purchase of ${promotionInfo.config.minimumPurchaseAmount.toFixed(2)}€ on other products.

      EXAMPLE OF HOW TO OFFER THE PROMOTION:
      "By the way! As this is your first purchase, you can add a completely free coffee to your order (${coffeeList}). Would you like to take advantage of this promotion? Remember that you have to exceed the minimum to be able to enjoy the promotion ${promotionInfo.config.minimumPurchaseAmount.toFixed(2)}€."
      `;

      modifiedPrompt += "\n\n" + promotionText;
    }

    // Optimizar el menú JSON para reducir tokens
    const optimizedMenu = optimizeMenu(menuJSON);

    // Construir el historial de contexto como parte del prompt del sistema
    const historyContext = fullHistory.length > 0
      ? "\nCONTEXTO_ANTERIOR:\n" + fullHistory
        .map(m => `${m.role === 'user' ? 'user' : 'assistant'}: ${m.content}`)
        .join("\n")
      : "";

    let systemPrompt = "";
    console.log('Historial completo:', fullHistory);
    if (fullHistory.length <= 4) {
      // Construir un prompt completo con todas las instrucciones y contexto
      systemPrompt = `
        Actúa como un "verificador de pedidos de restaurante". Tu tarea principal es procesar los pedidos con extrema precisión y cortesía, asegurándote de no mezclar categorías, inventar productos ni aceptar combinaciones incorrectas. Antes de responder o realizar cualquier acción, razona paso a paso a través de tu análisis interno y verifica cuidadosamente cada detalle con el menú proporcionado. Sigue este enfoque metódico para evitar errores:
        Sé rigurosamente preciso. Razona paso a paso internamente: identifica cada producto y extra solicitado, compáralos estrictamente con el JSON, rechaza los artículos que no coincidan o sean combinaciones, y revísalos antes de responder. Sé cortés y claro. No mezcles ni inventes productos ni combinaciones.
        
        [MENÚ JSON]
        Este es el menú en formato JSON: ${JSON.stringify(optimizedMenu)}. Usa esta información para todas tus respuestas. Evalúa cada solicitud (artículos, extras, precios) con este menú.
        
        Actúa como un "verificador de pedidos de restaurante". Tu tarea principal es procesar los pedidos con la máxima precisión y cortesía, asegurándote de no confundir categorías, inventar productos ni aceptar combinaciones incorrectas. Antes de responder o realizar cualquier acción, analiza paso a paso tu análisis interno y verifica cuidadosamente cada detalle con el menú proporcionado. Sigue este enfoque metódico para evitar errores:

        Reglas:
        Busca cada producto solicitado en el campo "nombre" dentro de la sección "artículos" de cada categoría en el JSON. La coincidencia debe ser exacta (respetando mayúsculas y minúsculas). Para los extras, verifica que estén en la sección "extras" del producto correspondiente y que la palabra "disponible" sea verdadera.
        Si hay un pequeño error ortográfico, corrígelo solo si es claro y único (por ejemplo, "CocaCola" → "Coca Cola"); si no, recházalo y solicita una aclaración. Si un producto o extra no está en el JSON o es una combinación no válida, responda: "Lo sentimos, '[artículo solicitado]' no está disponible en nuestro menú ni como combinación. Las opciones disponibles son: [lista en formato de producto + precio € y extras si corresponde]. ¿Qué desea pedir?"
        Agregue los valores de "precio" de los productos y extras válidos. Revíselo internamente antes de mostrar el total. Pregunte: "El total de su pedido es [total] €. ¿Confirma su compra?"
        Cierre: Muestre "producto + precio €" y, si hay extras, "extra + precio €" (ejemplo: "Napolitana 7,50 €, Anchoas 0,50 €"). Totalice con "€" y "Gracias por su compra".
        Reinicie después de la venta: "Bienvenido, ¿qué desea pedir hoy?"
        No indique el stock; asuma que todos los productos y extras con "disponible": verdadero están disponibles. 8. Si el nombre del producto solicitado es ambiguo o podría corresponder a varias opciones disponibles en el menú, solicite siempre la confirmación del cliente antes de continuar. Pregunte con claridad y respeto para asegurarse de que se refiere al producto exacto disponible. Por ejemplo: "¿Se refiere a esta opción o a otra? Por favor, confirme".
        Este paso es esencial para evitar malentendidos y garantizar que el cliente reciba exactamente lo que desea.
        
        Formato:
        Opciones: "producto + precio €" (extras, si corresponde: "extra + precio €").
        Cierre: "producto + precio €" y "extra + precio €".

        ${historyContext}

        Last user message: ${message}
      `;

      fullHistory.push({ role: 'assistant', content: systemPrompt });
    } else {
      // Llamadas posteriores: menú e instrucciones omitidas, solo historial
      systemPrompt = `
        ROLE: Friendly and accurate restaurant assistant. 😊

        [MENU AND INSTRUCTIONS OMITTED IN SUBSEQUENT CALLS]
        [Remember to comply with all the instructions mentioned above.]
        
        ${historyContext}

        Avoid putting things below this line in your answer.

        ACTUAL_MESSAGE: "${message}"
      `;
    }

    // Medir el tiempo que tarda la llamada a la API
    console.time('Gemini API Call Duration');

    // Enviar SOLO el mensaje actual del usuario a Gemini, 
    // con todo el contexto en el prompt del sistema
    const userMessage = [{ role: 'user', content: message }];

    // Realizar la llamada a la API de Gemini
    const response = await generateGeminiResponse(systemPrompt, userMessage, detectedLanguage);

    // Registrar el tiempo que tardó la llamada
    console.timeEnd('Gemini API Call Duration');

    // Procesar la respuesta
    try {
      let cleanedResponse = response;

      // Procesamiento básico para verificar si el pedido está finalizado
      if (response.includes('[ORDER_FINALIZED]')) {
        // Extraer datos del JSON para procesar el pedido
        let orderData = extractOrderData(response);
        if (orderData) {

          // Validar y corregir los cálculos antes de procesar
          orderData = validateOrderCalculations(orderData);

          // Si hay promoción disponible, aplicarla
          if (promotionInfo.available) {
            orderData = applyFirstBuyCoffeePromotion(orderData, promotionInfo);

            // Aplicamos validación de cálculos nuevamente para asegurar todo está correcto
            // después de aplicar la promoción
            orderData = validateOrderCalculations(orderData);
          }

          console.log('Datos del pedido extraídos y validados:', orderData);

          try {
            // Convertir el formato del JSON recibido al formato esperado por createOrder
            const formattedOrderData = {
              items: orderData.products.map(product => ({
                productId: product.productId,
                categoryId: product.categoryId,
                name: product.name,
                category: product.category,
                quantity: product.quantity || 1,
                price: product.price,
                extras: product.extras || [],
                modifications: product.modifications || [],
                total: product.totalProduct,
                promotionApplied: product.promotionApplied || null,
                notes: Array.isArray(product.notes)
                  ? (product.notas.length > 0 ? product.notas.join(", ") : "")
                  : (product.notas || "")
              })),
              total: orderData.totalOrder,
              appliedPromotions: orderData.appliedPromotions || []
            };

            // Modificar el numero de mesa si el usuario se equivoco
            if (orderData.tableNumber && orderData.tableNumber !== tableNumber) {
              console.log('Número de mesa modificado:', orderData.tableNumber);
              tableNumber = orderData.tableNumber;
            }

            // Usar el servicio existente para crear la orden
            const savedOrder = await createOrder(formattedOrderData, userId, businessId, tableNumber);

            // Si se aplicó la promoción y se creó el pedido correctamente, marcarla como utilizada
            if (promotionInfo.available && orderData.appliedPromotions &&
              orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra")) {
              await useFirstBuyCoffeePromotion(userId, savedOrder._id);
            }

            // Generar URL de pago
            const baseUrl = process.env.BASE_URL || 'https://whats2want-assistant.com';
            // Asegurarse de que el monto es un número válido con 2 decimales
            const validatedAmount = parseFloat(orderData.totalOrder).toFixed(2);
            const paymentUrl = `${baseUrl}/api/pay/${savedOrder._id}?amount=${validatedAmount}`;

            // Extraer la parte de la respuesta antes del marcador
            let responseBeforeMarker = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim();

            // Corregir cualquier error en los totales mostrados en la respuesta
            responseBeforeMarker = correctTotalsInResponse(responseBeforeMarker, orderData);

            // Añadir información de pago a la respuesta
            const paymentInfo = `\n\n✅ ¡Ya casi has terminado! 🎉\n\n💰 Para completar tu pedido, realiza el pago aquí: ${paymentUrl}`;

            // Construir respuesta final
            cleanedResponse = responseBeforeMarker + paymentInfo;

          } catch (orderError) {
            console.error('Error al procesar el pedido:', orderError);
            // Limpiar respuesta y añadir mensaje de error
            cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim() +
              "\n\n⚠️ Lo siento, ha ocurrido un problema al procesar tu pedido. Por favor, inténtalo de nuevo o contacta con el restaurante.";
          }
        } else {
          // Si no se pudo extraer JSON, solo limpiar la respuesta
          cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED]')).trim();
        }
      }

      return cleanedResponse;
    } catch (processingError) {
      console.error('Error al procesar la respuesta:', processingError);
      return 'Lo siento, ha ocurrido un error al procesar tu solicitud.';
    }
  } catch (error) {
    console.error('Error en handleMenuResponse:', error);
    return `Error: ${error.message}`;
  }
};

/**
 * Extrae los datos del pedido del formato JSON en la respuesta
 * @param {string} response - Respuesta completa del asistente
 * @returns {Object|null} - Datos del pedido o null si no se puede extraer
 */
function extractOrderData(response) {
  try {
    // Buscar el JSON después del marcador [ORDER_FINALIZED]
    const jsonStartIndex = response.indexOf('[ORDER_FINALIZED]') + '[ORDER_FINALIZED]'.length;

    if (jsonStartIndex > 0) {
      let jsonStr = response.substring(jsonStartIndex).trim();

      // Detectar si el JSON está envuelto en bloques de código markdown ```json
      const jsonCodeBlockMatch = jsonStr.match(/```json\s*([\s\S]+?)\s*```/);
      if (jsonCodeBlockMatch && jsonCodeBlockMatch[1]) {
        // Extraer el contenido dentro de los delimitadores de código
        jsonStr = jsonCodeBlockMatch[1].trim();
      }

      // Intentar analizar después de limpiar
      const parsedJson = JSON.parse(jsonStr);

      // Normalizar campos críticos para prevenir errores
      if (parsedJson && parsedJson.products && Array.isArray(parsedJson.products)) {
        parsedJson.products = parsedJson.products.map(product => {
          // Asegurar que notas no sea array vacío
          if (Array.isArray(product.notas) && product.notas.length === 0) {
            product.notas = "";
          }
          return product;
        });
      }

      console.log('JSON del pedido analizado correctamente');
      return parsedJson;
    }

    return null;
  } catch (error) {
    console.error('Error extrayendo datos del pedido:', error);
    // Log más detallado para depuración
    console.error('Texto que se intentó analizar:', response.substring(response.indexOf('[ORDER_FINALIZED]')).trim().substring(0, 100) + '...');
    return null;
  }
}

/**
 * Valida y corrige los cálculos matemáticos en el pedido
 * @param {Object} orderData - Datos del pedido extraídos 
 * @returns {Object} - Datos del pedido con cálculos corregidos
 */
function validateOrderCalculations(orderData) {
  try {
    if (!orderData || !orderData.products) {
      return orderData;
    }

    let orderTotal = 0;

    // Comprobar si hay una promoción de café gratis
    const hasCoffeePromo = orderData.appliedPromotions &&
      orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra");

    orderData.products.forEach(product => {
      // Inicializar con el precio base * cantidad
      const basePrice = Number(product.price) || 0;
      const quantity = Number(product.quantity) || 1;
      let productTotal = basePrice * quantity;

      // Procesar extras si existen
      if (product.extras && Array.isArray(product.extras)) {
        product.extras.forEach(extra => {
          const extraPrice = Number(extra.price) || 0;
          const extraQuantity = Number(extra.quantity) || 1;
          // Corregir el total del extra
          const extraTotal = extraPrice * extraQuantity;
          extra.totalExtra = parseFloat(extraTotal.toFixed(2));

          // Añadir al total del producto
          productTotal += extraTotal;
        });
      }

      // IMPORTANTE: Verificar si este producto tiene una promoción de café gratis aplicada
      if (hasCoffeePromo && product.promotionApplied &&
        product.promotionApplied.name === "Café Gratis - Primera Compra") {
        // Si el producto tiene la promoción, respetamos su precio en 0 o el descuento
        if (product.quantity <= 1) {
          productTotal = 0; // Un café = completamente gratis
        } else {
          // Más de un café = solo uno gratis
          productTotal = basePrice * (quantity - 1);
        }
        console.log(`Respetando promoción de café gratis para ${product.name}, precio final: ${productTotal}€`);
      }

      // Redondear a 2 decimales y corregir el total del producto
      product.totalProduct = parseFloat(productTotal.toFixed(2));

      // Añadir al total del pedido
      orderTotal += productTotal;
    });

    // Corregir el total de la orden
    orderData.totalOrder = parseFloat(orderTotal.toFixed(2));

    console.log('Cálculos del pedido validados y corregidos');
    return orderData;
  } catch (error) {
    console.error('Error en la validación de cálculos:', error);
    return orderData; // Devolver los datos originales en caso de error
  }
}

/**
 * Corrige los montos totales en el texto de respuesta para que coincidan con los cálculos reales
 * @param {string} responseText - Texto de respuesta de la IA
 * @param {Object} orderData - Datos del pedido validados
 * @returns {string} - Respuesta corregida
 */
function correctTotalsInResponse(responseText, orderData) {
  try {
    if (!orderData || !responseText) {
      return responseText;
    }

    let correctedResponse = responseText;

    // Verificar si hay promociones aplicadas
    const hasPromotions = orderData.appliedPromotions && orderData.appliedPromotions.length > 0;

    // Si hay promoción de café gratis, asegurarnos de que se menciona en la respuesta
    if (hasPromotions && orderData.appliedPromotions.some(p => p.name === "Café Gratis - Primera Compra")) {
      const coffeePromo = orderData.appliedPromotions.find(p => p.name === "Café Gratis - Primera Compra");

      // Verificar si la promoción ya está mencionada
      const promoMentioned = responseText.toLowerCase().includes('café gratis') ||
        responseText.toLowerCase().includes('primera compra') ||
        responseText.toLowerCase().includes('promoción');

      // Si no está mencionada, añadirla antes del total
      if (!promoMentioned) {
        // Buscar el total para insertar antes
        const totalMatch = responseText.match(/Total:?\s+(\d+[.,]\d+)€/i);

        if (totalMatch && totalMatch.index) {
          const insertPosition = totalMatch.index;
          const promoText = `\n\n🎁 **Promoción aplicada**: ${coffeePromo.name} (-${coffeePromo.discountAmount.toFixed(2)}€)\n\n`;

          correctedResponse =
            responseText.substring(0, insertPosition) +
            promoText +
            responseText.substring(insertPosition);
        }
      }

      // También corregir cualquier mención del café que no lo muestre como gratis
      const productName = coffeePromo.appliedTo;
      if (productName) {
        // Buscar menciones del café con precio distinto a 0
        const productPricePattern = new RegExp(`${escapeRegExp(productName)}[^0-9€]*\\d+[.,]\\d+€`, 'gi');

        correctedResponse = correctedResponse.replace(productPricePattern, (match) => {
          return `${productName}: 0.00€ (GRATIS - Primera compra)`;
        });
      }
    }

    // 1. Corregir el total general en la respuesta (código existente)
    // Buscar patrones como "Total: XX.XX€" o "Total de XX.XX€"
    const totalPatterns = [
      /Total:?\s+(\d+[.,]\d+)€/i,
      /Total de:?\s+(\d+[.,]\d+)€/i,
      /Total del pedido:?\s+(\d+[.,]\d+)€/i,
      /Total a pagar:?\s+(\d+[.,]\d+)€/i,
      /El total es:?\s+(\d+[.,]\d+)€/i,
      /El total son:?\s+(\d+[.,]\d+)€/i,
      /El total de tu orden es de:?\s+(\d+[.,]\d+)€/
    ];

    // Valor correcto calculado
    const correctTotal = orderData.totalOrder;

    // Reemplazar todos los patrones de total encontrados
    totalPatterns.forEach(pattern => {
      correctedResponse = correctedResponse.replace(pattern, (match, amount) => {
        // Solo reemplazar si el monto es diferente (con margen de error)
        const parsedAmount = parseFloat(amount.replace(',', '.'));
        if (Math.abs(parsedAmount - correctTotal) > 0.01) {
          console.log(`Corrigiendo total en respuesta: ${parsedAmount}€ → ${correctTotal}€`);
          return match.replace(amount, correctTotal.toFixed(2).replace('.', ','));
        }
        return match;
      });
    });

    return correctedResponse;
  } catch (error) {
    console.error('Error corrigiendo totales en respuesta:', error);
    return responseText;
  }
}

// Función auxiliar para escapar caracteres especiales en expresiones regulares
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Optimiza el menú JSON para reducir tokens
 * @param {Object} menuJSON - El menú completo
 * @returns {Object} - Menú optimizado
 */
function optimizeMenu(menuJSON) {
  try {
    // Versión simple: eliminar descripciones largas y campos innecesarios
    const optimized = {
      categories: []
    };

    if (!menuJSON || !menuJSON.categories) {
      return menuJSON; // Si no hay estructura esperada, devolver tal cual
    }

    // Por cada categoría, mantener solo los campos esenciales
    optimized.categories = menuJSON.categories.map(category => {
      const simplifiedCategory = {
        _id: category._id,
        name: category.name,
        products: []
      };

      // Por cada producto, mantener solo los campos esenciales
      if (category.products && Array.isArray(category.products)) {
        simplifiedCategory.products = category.products.map(product => {
          return {
            _id: product._id,
            name: product.name,
            price: product.price,
            extras: product.extras ? product.extras.map(extra => ({
              _id: extra._id,
              name: extra.name,
              price: extra.price
            })) : []
          };
        });
      }

      return simplifiedCategory;
    });

    return optimized;
  } catch (error) {
    console.error('Error optimizando menú:', error);
    return menuJSON; // En caso de error, usar el original
  }
}
