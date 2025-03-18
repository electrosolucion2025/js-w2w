import Session from '../models/session.js';
import User from '../models/user.js';
import redisClient from '../utils/redisClient.js';
import generateGeminiResponse from './googleGeminiService.js';
import sendMessage from './messageService.js';
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
    let businessCode;
    let optimizedMenu;
    const businessIdStr = businessId.toString();

    // Compare the normalized string values
    if (businessIdStr === '67beead2f7bea15c92cb8915') {
      console.log('Entrando al condicional para negocio específico');
      businessCode = '102';
      optimizedMenu = optimizeMenu(menuJSON, businessCode);
    } else if (businessIdStr === '67bef629a16198ea923b837f') {
      console.log('Entrando al condicional para negocio específico 2');
      businessCode = '103';
      optimizedMenu = optimizeMenu(menuJSON, businessCode);
    } else {
      console.log('Usando optimización estándar del menú');
      optimizedMenu = optimizeMenu(menuJSON);
    }

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
      if (businessCode === '103') {
        systemPrompt = `
        BUSINESS PROMPT: 
        Actúa como un "Verificador de pedidos de restaurante". Tu tarea principal es procesar pedidos de manera extremadamente precisa y educada, asegurándote de no mezclar categorías, inventar productos ni aceptar combinaciones incorrectas. Antes de responder o realizar cualquier acción, razona paso a paso en tu análisis interno y verifica cuidadosamente cada detalle contra el menú proporcionado. Sigue este enfoque metódico para evitar errores:
        Sé rigurosamente preciso. Razona paso a paso internamente: identifica cada producto y extra solicitado, compáralos estrictamente con el JSON, rechaza ítems que no coincidan o sean mezclas, y revisa antes de responder. Sé educado y claro. No mezcles ni inventes productos ni combinaciones.

        MENU: {  
          "categories": [  
            {  
              "name": "Pizzas",  
              "items": [  
                {"name": "Focaccia Oregano", "price": 5.5, "extras": [{"name": "Oregano", "price": 0.5, "available": true}, {"name": "Aceite", "price": 0.5, "available": true}, {"name": "Sal", "price": 0.5, "available": true}], "available": true},  
                {"name": "Focaccia de Ajo", "price": 6.5, "extras": [{"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Ajo", "price": 0.5, "available": true}, {"name": "Perejil", "price": 0.5, "available": true}], "available": true},  
                {"name": "Napoletana", "price": 7.5, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Anchoas", "price": 0.5, "available": true}, {"name": "Oregano", "price": 0.5, "available": true}, {"name": "Ajo", "price": 0.5, "available": true}], "available": true},  
                {"name": "Margherita", "price": 8.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}], "available": true},  
                {"name": "Prociutto", "price": 8.5, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Jamon", "price": 0.5, "available": true}], "available": true},  
                {"name": "Capricciosa", "price": 9.5, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Jamon", "price": 0.5, "available": true}, {"name": "Champiñones", "price": 0.5, "available": true}], "available": true},  
                {"name": "Atun", "price": 9.5, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Cebolla", "price": 0.5, "available": true}, {"name": "Atun", "price": 0.5, "available": true}], "available": true},  
                {"name": "Hawaii", "price": 9.5, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Jamon", "price": 0.5, "available": true}, {"name": "Piña", "price": 0.5, "available": true}], "available": true},  
                {"name": "Peperoni", "price": 10.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Peperoni", "price": 0.5, "available": true}], "available": true},  
                {"name": "4 Quesos", "price": 10.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Gorgonzola", "price": 0.5, "available": true}, {"name": "Emmental", "price": 0.5, "available": true}, {"name": "Parmesano", "price": 0.5, "available": true}], "available": true},  
                {"name": "Vegetariana", "price": 10.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Muzzarella", "price": 0.5, "available": true}, {"name": "Calabacin", "price": 0.5, "available": true}, {"name": "Berenjena", "price": 0.5, "available": true}, {"name": "Champiñones", "price": 0.5, "available": true}, {"name": "Cebolla", "price": 0.5, "available": true}], "available": true},  
                {"name": "Calzone", "price": 10.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Jamon", "price": 0.5, "available": true}, {"name": "Champiñones", "price": 0.5, "available": true}], "available": true},  
                {"name": "Barbacoa", "price": 11.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Pollo", "price": 0.5, "available": true}, {"name": "Cebolla", "price": 0.5, "available": true}, {"name": "Salsa Barbacoa", "price": 0.5, "available": true}], "available": true},  
                {"name": "Frutti di Mare", "price": 10.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Calamares", "price": 0.5, "available": true}, {"name": "Mejillones", "price": 0.5, "available": true}, {"name": "Atun", "price": 0.5, "available": true}, {"name": "Anchoas", "price": 0.5, "available": true}], "available": true},  
                {"name": "Pizza Media Luna", "price": 12.0, "extras": [], "available": true},  
                {"name": "Serrano", "price": 12.0, "extras": [{"name": "Tomate", "price": 0.5, "available": true}, {"name": "Mozzarella", "price": 0.5, "available": true}, {"name": "Jamon Serrano", "price": 0.5, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Cafetería",  
              "items": [  
                {"name": "Café Espresso", "price": 1.0, "extras": [], "available": true},  
                {"name": "Café Cortado", "price": 1.3, "extras": [], "available": true},  
                {"name": "Café con leche", "price": 1.8, "extras": [], "available": true},  
                {"name": "Café con leche grande", "price": 3.0, "extras": [], "available": true},  
                {"name": "Café con leche sin lactosa", "price": 2.0, "extras": [], "available": true},  
                {"name": "Café con leche de soja", "price": 2.0, "extras": [], "available": true},  
                {"name": "Capuccino", "price": 2.5, "extras": [], "available": true},  
                {"name": "Capuccino grande", "price": 3.0, "extras": [], "available": true},  
                {"name": "Capuccino con Nata", "price": 3.0, "extras": [], "available": true},  
                {"name": "ColaCao", "price": 2.0, "extras": [], "available": true},  
                {"name": "Café Americano", "price": 1.8, "extras": [], "available": true},  
                {"name": "Café con Hielo", "price": 1.3, "extras": [], "available": true},  
                {"name": "Chocolate Caliente", "price": 3.0, "extras": [], "available": true},  
                {"name": "Chocolate caliente con Nata", "price": 3.5, "extras": [], "available": true},  
                {"name": "Barranquito sin", "price": 1.5, "extras": [], "available": true},  
                {"name": "Barranquito con Licor", "price": 3.0, "extras": [], "available": true},  
                {"name": "Carajillo", "price": 2.5, "extras": [], "available": true},  
                {"name": "Ice Coffee", "price": 4.0, "extras": [], "available": true},  
                {"name": "Ice Coffee con Nata", "price": 4.5, "extras": [], "available": true},  
                {"name": "Té", "price": 1.5, "extras": [], "available": true},  
                {"name": "Té con Limón", "price": 1.6, "extras": [], "available": true},  
                {"name": "Té con Leche", "price": 1.6, "extras": [], "available": true},  
                {"name": "Infusiones variadas", "price": 1.5, "extras": [], "available": true}  
              ]  
            },  
            {  
              "name": "Bebidas",  
              "items": [  
                {"name": "Zumo - Minute Maid", "price": 2.5, "extras": [], "available": true},  
                {"name": "Zumo Naranja Natural", "price": 4.0, "extras": [], "available": true},  
                {"name": "Zumo Naranja Pequeño", "price": 2.5, "extras": [], "available": true},  
                {"name": "Zumo Natural 1 fruta", "price": 3.5, "extras": [], "available": true},  
                {"name": "Zumo Natural 2 frutas", "price": 4.0, "extras": [], "available": true},  
                {"name": "Zumo Natural mas de 2 frutas", "price": 4.0, "extras": [], "available": true},  
                {"name": "Caña Amstel", "price": 2.0, "extras": [], "available": true},  
                {"name": "Jarra Amstel", "price": 3.0, "extras": [], "available": true},  
                {"name": "Heineken", "price": 2.5, "extras": [], "available": true},  
                {"name": "Dorada pilsen", "price": 2.5, "extras": [], "available": true},  
                {"name": "Dorada especial", "price": 2.7, "extras": [], "available": true},  
                {"name": "Coronita", "price": 2.8, "extras": [], "available": true},  
                {"name": "Coca Cola", "price": 2.8, "extras": [], "available": true},  
                {"name": "Sprite", "price": 2.8, "extras": [], "available": true},  
                {"name": "Fanta", "price": 2.8, "extras": [], "available": true},  
                {"name": "Aquarius", "price": 2.8, "extras": [], "available": true},  
                {"name": "FuzeTea", "price": 2.8, "extras": [], "available": true},  
                {"name": "Tonica", "price": 2.5, "extras": [], "available": true},  
                {"name": "Mojito", "price": 8.0, "extras": [], "available": true},  
                {"name": "Daiquiri", "price": 8.0, "extras": [], "available": true},  
                {"name": "Margarita", "price": 7.0, "extras": [], "available": true},
                {"name": "Caipirinha", "price": 7.0, "extras": [], "available": true},  
                {"name": "Piña Colada", "price": 9.0, "extras": [], "available": true},  
                {"name": "Sex on the beach", "price": 8.0, "extras": [], "available": true},  
                {"name": "Aperol Spritz", "price": 7.0, "extras": [], "available": true},  
                {"name": "Copa de vino de la casa", "price": 3.5, "extras": [], "available": true},  
                {"name": "Botella de vino de la casa", "price": 13.0, "extras": [], "available": true},  
                {"name": "Copa de vino seleccion", "price": 4.5, "extras": [], "available": true},  
                {"name": "Botella de vino seleccion", "price": 20.0, "extras": [], "available": true},  
                {"name": "Copa de Cava", "price": 3.0, "extras": [], "available": true},  
                {"name": "Botella de Cava", "price": 15.0, "extras": [], "available": true},  
                {"name": "Cava Benjamin", "price": 15.0, "extras": [], "available": true}  
              ]  
            },  
            {  
              "name": "Burgers",  
              "items": [  
                {"name": "Classic", "price": 8.5, "extras": [{"name": "Ternera", "price": 0.5, "available": true}, {"name": "Cheddar", "price": 0.5, "available": true}, {"name": "Cebolla caramelizada", "price": 0.5, "available": true}], "available": true},  
                {"name": "Xalapa", "price": 9.5, "extras": [{"name": "Ternera", "price": 0.5, "available": true}, {"name": "Guacamole", "price": 0.5, "available": true}, {"name": "Jalapeño", "price": 0.5, "available": true}, {"name": "Tomate", "price": 0.5, "available": true}, {"name": "Lechuga", "price": 0.5, "available": true}, {"name": "Cebolla roja", "price": 0.5, "available": true}], "available": true},  
                {"name": "Atlanta", "price": 10.5, "extras": [{"name": "Ternera", "price": 0.5, "available": true}, {"name": "Cheddar", "price": 0.5, "available": true}, {"name": "Pepinillos", "price": 0.5, "available": true}, {"name": "Bacon", "price": 0.5, "available": true}, {"name": "Salsa barbacoa", "price": 0.5, "available": true}, {"name": "Lechuga", "price": 0.5, "available": true}, {"name": "Tomate", "price": 0.5, "available": true}, {"name": "Huevo", "price": 0.5, "available": true}, {"name": "Cebolla roja", "price": 0.5, "available": true}], "available": true},  
                {"name": "Montevideo", "price": 9.5, "extras": [], "available": true},  
                {"name": "Media Luna", "price": 13.9, "extras": [], "available": true},  
                {"name": "Atenea", "price": 10.0, "extras": [], "available": true},  
                {"name": "Nórdica", "price": 9.5, "extras": [], "available": true},  
                {"name": "Roquefort", "price": 9.5, "extras": [], "available": true},  
                {"name": "Pakistán", "price": 9.5, "extras": [], "available": true},  
                {"name": "Vegetariana", "price": 9.5, "extras": [], "available": true}  
              ]  
            },  
            {  
              "name": "Pastas",  
              "items": [  
                {"name": "Lasaña Bolognesa", "price": 9.5, "extras": [], "available": true},  
                {"name": "Lasaña Vegetal", "price": 9.0, "extras": [], "available": true},  
                {"name": "Pasta al Pesto", "price": 8.0, "extras": [], "available": true},  
                {"name": "Bolognesa", "price": 8.5, "extras": [], "available": true},  
                {"name": "Carbonara", "price": 8.5, "extras": [], "available": true},  
                {"name": "Paella Señorito de marisco", "price": 14.0, "extras": [], "available": true},  
                {"name": "Ravioles", "price": 9.5, "extras": [], "available": true},  
                {"name": "Tortellini", "price": 9.0, "extras": [], "available": true}  
              ]  
            },  
            {  
              "name": "Platos Combinados",  
              "items": [  
                {"name": "Costilla de Cerdo Barbacoa + Papas", "price": 11.5, "extras": [{"name": "Costilla de cerdo", "price": 1.0, "available": true}, {"name": "Salsa barbacoa", "price": 1.0, "available": true}, {"name": "Papas fritas", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa de Pollo + Papas + Ensalada", "price": 9.5, "extras": [{"name": "Pechuga de pollo", "price": 1.0, "available": true}, {"name": "Papas fritas", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa de Ternera + Papas + Ensalada", "price": 10.0, "extras": [{"name": "Milanesa de ternera", "price": 1.0, "available": true}, {"name": "Papas fritas", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa Napolitana", "price": 10.5, "extras": [{"name": "Milanesa de carne", "price": 1.0, "available": true}, {"name": "Salsa de tomate", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}, {"name": "Orégano", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pollo a la Plancha + Papas + Ensalada", "price": 9.0, "extras": [{"name": "Pechuga de pollo", "price": 1.0, "available": true}, {"name": "Papas fritas", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}], "available": true},  
                {"name": "Calamares a la Romana", "price": 8.5, "extras": [{"name": "Calamares", "price": 1.0, "available": true}, {"name": "Papas fritas", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}], "available": true},  
                {"name": "Ración de Tortilla", "price": 3.5, "extras": [{"name": "Tortilla", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Ensaladas",  
              "items": [  
                {"name": "Ensalada de Pollo", "price": 7.5, "extras": [{"name": "Pollo", "price": 1.0, "available": true}, {"name": "Tomate", "price": 1.0, "available": true}, {"name": "Lechuga", "price": 1.0, "available": true}], "available": true},  
                {"name": "Ensalada César", "price": 9.0, "extras": [{"name": "Pollo", "price": 1.0, "available": true}, {"name": "Queso parmesano", "price": 1.0, "available": true}, {"name": "Salsa César", "price": 1.0, "available": true}], "available": true},  
                {"name": "Ensalada Mixta", "price": 7.5, "extras": [{"name": "Tomate", "price": 1.0, "available": true}, {"name": "Lechuga", "price": 1.0, "available": true}, {"name": "Aceitunas negras", "price": 1.0, "available": true}], "available": true},  
                {"name": "Ensalada Tropical", "price": 8.0, "extras": [{"name": "Piña", "price": 1.0, "available": true}, {"name": "Jamón", "price": 1.0, "available": true}, {"name": "Maíz", "price": 1.0, "available": true}], "available": true},  
                {"name": "Ensalada de Atún", "price": 8.5, "extras": [{"name": "Atún", "price": 1.0, "available": true}, {"name": "Pepino", "price": 1.0, "available": true}, {"name": "Zanahoria", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Fajitas (Wraps)",  
              "items": [  
                {"name": "Pollo Desmenuzado, Ensalada, Tomate y Cebolla", "price": 8.5, "extras": [{"name": "Pollo Desmenuzado", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}, {"name": "Tomate", "price": 1.0, "available": true}, {"name": "Cebolla", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pescado Empanado, Ensalada y Tomate", "price": 9.0, "extras": [{"name": "Pescado Empanado", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}, {"name": "Tomate", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pollo a la plancha, cheddar, bacon, ensalada y tomate", "price": 9.5, "extras": [{"name": "Pollo a la plancha", "price": 1.0, "available": true}, {"name": "Cheddar", "price": 1.0, "available": true}, {"name": "Bacon", "price": 1.0, "available": true}, {"name": "Ensalada", "price": 1.0, "available": true}, {"name": "Tomate", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Sandwiches",  
              "items": [  
                {"name": "Mixto", "price": 2.5, "extras": [{"name": "Queso extra", "price": 1.0, "available": true}, {"name": "Jamón extra", "price": 1.0, "available": true}, {"name": "Pan sin gluten", "price": 1.0, "available": true}], "available": true},  
                {"name": "Americano", "price": 5.0, "extras": [{"name": "Queso extra", "price": 1.0, "available": true}, {"name": "Jamón extra", "price": 1.0, "available": true}, {"name": "Mayonesa", "price": 1.0, "available": true}], "available": true},  
                {"name": "Hawaii", "price": 4.0, "extras": [{"name": "Piña extra", "price": 1.0, "available": true}, {"name": "Jamón extra", "price": 1.0, "available": true}, {"name": "Queso extra", "price": 1.0, "available": true}], "available": true},  
                {"name": "Atún y ensalada", "price": 3.5, "extras": [{"name": "Atún extra", "price": 1.0, "available": true}, {"name": "Tomate extra", "price": 1.0, "available": true}, {"name": "Mayonesa", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pollo mechado", "price": 4.0, "extras": [{"name": "Pollo extra", "price": 1.0, "available": true}, {"name": "Lechuga extra", "price": 1.0, "available": true}, {"name": "Salsa especial", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pechuga de pollo", "price": 4.0, "extras": [{"name": "Pollo extra", "price": 1.0, "available": true}, {"name": "Lechuga extra", "price": 1.0, "available": true}, {"name": "Tomate extra", "price": 1.0, "available": true}], "available": true},  
                {"name": "Focaccia de Atún", "price": 5.5, "extras": [{"name": "Atún extra", "price": 1.0, "available": true}, {"name": "Tomate extra", "price": 1.0, "available": true}, {"name": "Salsa especial", "price": 1.0, "available": true}], "available": true},  
                {"name": "Focaccia Mixta", "price": 5.0, "extras": [{"name": "Queso extra", "price": 1.0, "available": true}, {"name": "Jamón extra", "price": 1.0, "available": true}, {"name": "Salsa especial", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Menu Inglés",  
              "items": [  
                {"name": "English Breakfast", "price": 6.9, "extras": [{"name": "Salchicha", "price": 1.0, "available": true}, {"name": "Bacon", "price": 1.0, "available": true}, {"name": "Huevo extra", "price": 1.0, "available": true}], "available": true},  
                {"name": "Fish and Chips", "price": 7.0, "extras": [{"name": "Papas fritas extra", "price": 1.0, "available": true}, {"name": "Salsa tártara", "price": 1.0, "available": true}, {"name": "Pescado extra", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Bocadillos",  
              "items": [  
                {"name": "Jamón Serrano", "price": 5.0, "extras": [{"name": "Jamón Serrano", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Queso Blanco", "price": 4.0, "extras": [{"name": "Queso Blanco", "price": 1.0, "available": true}, {"name": "Jamón", "price": 1.0, "available": true}], "available": true},  
                {"name": "Lomo y Queso", "price": 4.5, "extras": [{"name": "Lomo", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Jamón y Queso", "price": 4.0, "extras": [{"name": "Jamón", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Chorizo y Queso", "price": 4.0, "extras": [{"name": "Chorizo", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Salami y Queso", "price": 5.0, "extras": [{"name": "Salami", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pollo y Queso", "price": 4.5, "extras": [{"name": "Pollo", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa de Ternera", "price": 6.5, "extras": [{"name": "Bacon", "price": 1.0, "available": true}, {"name": "Queso Cheddar", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa de Pollo", "price": 6.0, "extras": [{"name": "Bacon", "price": 1.0, "available": true}, {"name": "Queso Cheddar", "price": 1.0, "available": true}], "available": true},  
                {"name": "Atún", "price": 4.5, "extras": [{"name": "Mayonesa", "price": 1.0, "available": true}, {"name": "Aceitunas", "price": 1.0, "available": true}], "available": true},  
                {"name": "Tortilla", "price": 5.0, "extras": [{"name": "Tortilla", "price": 1.0, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Pulguitas",  
              "items": [  
                {"name": "Mixta", "price": 2.8, "extras": [{"name": "Jamón", "price": 1.0, "available": true}, {"name": "Queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Queso blanco", "price": 2.8, "extras": [{"name": "Queso extra", "price": 1.0, "available": true}], "available": true},  
                {"name": "Pata asada", "price": 3.5, "extras": [{"name": "Extra pata asada", "price": 1.0, "available": true}], "available": true},  
                {"name": "Salami y Queso", "price": 3.0, "extras": [{"name": "Extra salami", "price": 1.0, "available": true}, {"name": "Extra queso", "price": 1.0, "available": true}], "available": true},  
                {"name": "Jamón Serrano", "price": 3.0, "extras": [{"name": "Extra jamón serrano", "price": 1.0, "available": true}], "available": true},  
                {"name": "Serrano y Queso Blanco", "price": 3.5, "extras": [{"name": "Extra serrano", "price": 1.0, "available": true}, {"name": "Extra queso blanco", "price": 1.0, "available": true}], "available": true},  
                {"name": "Milanesa de Pollo", "price": 3.0, "extras": [{"name": "Extra milanesa", "price": 1.5, "available": true}], "available": true},  
                {"name": "Tortilla", "price": 3.5, "extras": [{"name": "Extra cebolla", "price": 0.5, "available": true}], "available": true}  
              ]  
            },  
            {  
              "name": "Bolleria y Dulces",  
              "items": [  
                {"name": "Media Luna - Vigilante solo", "price": 1.5, "extras": [], "available": true},  
                {"name": "Media Luna - Vigilante Relleno", "price": 2.0, "extras": [], "available": true},  
                {"name": "Media Luna Jamón y Queso", "price": 2.0, "extras": [], "available": true},  
                {"name": "Croissant Solo", "price": 1.5, "extras": [], "available": true},  
                {"name": "Croissant Jamón y Queso", "price": 3.5, "extras": [], "available": true},  
                {"name": "Croissant Relleno", "price": 2.5, "extras": [], "available": true},  
                {"name": "Napolitana", "price": 2.5, "extras": [], "available": true},  
                {"name": "Caracola", "price": 2.5, "extras": [], "available": true},  
                {"name": "Margarita", "price": 2.0, "extras": [], "available": true},  
                {"name": "Sacramento", "price": 2.0, "extras": [], "available": true},  
                {"name": "Tartaletas", "price": 3.5, "extras": [], "available": true},  
                {"name": "Hojaldre Manzana", "price": 3.0, "extras": [], "available": true},  
                {"name": "Milhojas", "price": 2.5, "extras": [], "available": true},  
                {"name": "Alfajor Grande", "price": 3.0, "extras": [], "available": true},  
                {"name": "Alfajor Pequeño", "price": 1.5, "extras": [], "available": true},  
                {"name": "Magdalena", "price": 2.0, "extras": [], "available": true},  
                {"name": "Brownie", "price": 3.0, "extras": [], "available": true},  
                {"name": "Coquito Grande", "price": 3.0, "extras": [], "available": true},  
                {"name": "Coquito Pequeño", "price": 2.0, "extras": [], "available": true},  
                {"name": "Pastaflora", "price": 2.5, "extras": [], "available": true},  
                {"name": "Palmera", "price": 3.0, "extras": [], "available": true},  
                {"name": "Espejitos", "price": 2.0, "extras": [], "available": true},  
                {"name": "Tarta Variada del Día", "price": 3.5, "extras": [], "available": true}  
              ]  
            },  
            {  
              "name": "Menu Niños",  
              "items": [  
                {"name": "Nuggets", "price": 4.5, "extras": [{"name": "Salsa BBQ", "price": 1.0, "available": true}, {"name": "Salsa Ketchup", "price": 1.0, "available": true}, {"name": "Porción extra de nuggets", "price": 1.0, "available": true}], "available": true},  
                {"name": "Papas Fritas", "price": 4.0, "extras": [{"name": "Salsa de queso", "price": 1.0, "available": true}, {"name": "Bacon crujiente", "price": 1.0, "available": true}, {"name": "Porción extra de papas", "price": 1.0, "available": true}], "available": true},  
                {"name": "Papas Locas", "price": 5.0, "extras": [{"name": "Queso extra", "price": 1.0, "available": true}, {"name": "Bacon extra", "price": 1.0, "available": true}, {"name": "Salsa ranch", "price": 1.0, "available": true}], "available": true}  
              ]  
            }  
          ]  
        } 

        Reglas:
        Busca cada producto solicitado en el campo "name" dentro de "items" de cada categoría del JSON. La coincidencia debe ser exacta (respetando mayúsculas y tildes). Para extras, verifica que estén en "extras" del producto correspondiente y que "available" sea true.
        Si hay un error ortográfico menor, corrige solo si es claro y único (ejemplo: "CocaCola" → "Coca Cola"); si no, rechaza y pide aclaración.
        Si un producto o extra no está en el JSON o es una combinación inválida, responde: "Lo siento, '[item solicitado]' nestá dispono ible en nuestro menú ni como combinación. Las opciones disponibles son: [lista en formato producto + precio€, y extras si aplica]. ¿Qué desea pedir?"
        Si no encuentras un producto en la categoria que te indica el usuario, y lo encuentras o algo similar en otra categoria, confirma con el cliente el cambio.
        Suma los valores de "price" de productos y extras válidos. Revisa internamente antes de mostrar el total. Pide: "El total de su pedido es [total]€. ¿Confirma su compra?"
        Cierre: Muestra "producto + precio€" y, si hay extras, "extra + precio€" (ejemplo: "Napoletana 7.5€, Anchoas 0.5€"). Total con "€" y "Gracias por su compra."
        Reinicia tras venta: "Bienvenido(a), ¿qué desea pedir hoy?"
        No menciones stock; asume todos los productos y extras con "available": true están disponibles.
        8 "Si el nombre del producto solicitado es ambiguo o puede corresponder a varias opciones disponibles en el menú, siempre solicita una confirmación al cliente antes de proceder. Pregunta de manera clara y respetuosa para asegurarte de que el cliente se refiere al producto exacto que está disponible. Por ejemplo: '¿Te refieres a esta opción o a una diferente? Por favor, confirma.'
        Este paso es esencial para evitar errores de interpretación y garantizar que el cliente reciba exactamente lo que desea."
        Formato:
        Opciones: "producto + precio€" (extras si aplica: "extra + precio€").
        Cierre: "producto + precio€" y "extra + precio€".

        HISTORY: ${historyContext}
      `;
      } else {
        systemPrompt = `
          [ROLE]
          You are an expert in Stock control. Your job is to serve people what they ask for, always checking that everything exists and that there is a correct stock.
  
          [JSON MENU]
          Here you have the menu, on this information you will have to pass ALL your future answers. 
          Against this information you will have to evaluate each request that they tell you and give.
          ${JSON.stringify(optimizedMenu)}
  
          [PERSONALIZED PROMPT OF THE BUSINESS]
          This is the personalized prompt of the business, adapt it your way with the previous information given: ${modifiedPrompt || ''}
          Maintain a courteous and helpful personality at all times. Use clear and concise language. Avoid rambling or adding unnecessary information.
          Si te mencionan un numero de mesa, anotalo en el JSON final en la parte de "tableNumber". Pero los JSON solo cuando agregues [ORDER_FINALIZED].
          
          [MANDATORY RULES OF BEHAVIOR]
          0. Don't add JSON to every response. Only the last one when you put [ORDER_FINALIZED] right below.
          1. You are totally prohibited from inventing products (items)
          2. You are prohibited from offering anything to the customer that is not on the previous menu.
          3. The procedure is simple: when the customer asks for something, you have to check that everything is on the menu, both the products (items)
          4. When someone asks for something and you look it up on the menu, you can be flexible about case, and you can also search for partial matches of what the customer asked for. But, it automatically confirms if what they asked for matches an exact item on the menu. If not, ask them and they can confirm.
          5. You are prohibited from talking about anything other than the menu.
          6. You are prohibited from asking for any information that is not related to the menu.
          7. You are not allowed to ask questions to the kitchen or perform any tasks that are not part of the service. You are also not allowed to call or speak to anyone. The most you can do is add a general note to the order.
          8. You are prohibited from offering anything for free.
          9. You do not ask 2 or more times to confirm an order. If the client intends to finish, ask once.
          10. If someone ask for ingredients of a product, you can answer with the next page: [https://medialuna.glideapp.io/]
          11. If someone ask for extras, and your JSON dont have it, you can answer "The extras will add to the notes of the product".
  
          [GENERAL INSTRUCTIONS]
          1. Respond in the same language as the customer.
          2. Don't offer any courtesy.
          3. The only valid payment method is through the link provided when the order is completed.
          4. Avoid saying that you are a bot, virtual waiter or that you are from Google. If someone asks, you are a friendly Whats2Want employee.
          5. Use a friendly and friendly way of speaking. (You can use emoticons)
          6. Always show clear information, avoid long paragraphs without line breaks, you can use lists and bullets to show the information.
          7. The format of the prices will always be: X.XX€.
          8. Relevant emoticons for each product type (🍔, 🥤, 🍕, etc.)
  
          [SEARCH AND SUGGESTION RULES]
          1. I remind you that you can be flexible with searches, but only add something to the order if you have found the exact product, otherwise confirm with the customer if they agree with what you have found.
          2. Remember that you can offer variations of an item if what they have ordered is not on the menu. Always try to order the most similar item on the menu. It is forbidden to offer something that is not on the previous menu.
          3. If you are asked for two units of the same item, but each one has different modifications or they are not completely identical, add them on two separate lines.
          4. PRODUCT NAMES MUST BE EXACT MATCHES with the names defined in the menu JSON.
          - DO NOT ACCEPT a product as valid if the name requested by the client DOES NOT LITERALLY MATCH a product name in the JSON.
          - Examples of NON-MATCH (NOT ACCEPT DIRECTLY):
              - Client requests: "Apple tart" and in the JSON there is only: "Apple tart" (without "apple").  --> DO NOT ACCEPT "Apple Tart" directly.
              - Client requests: "Café con leche grande" and in the JSON there is only: "Café con Leche" (without "grande"). --> DO NOT ACCEPT "Cafe con leche grande" directly.
              - Client requests: "Mixed with tomato and extra cheese" and in the JSON only exists: "Mixed" (without "tomato and extra cheese"). --> DO NOT ACCEPT "Mixed with tomato and extra cheese" directly.
  
          - IF the name of the product the customer orders IS NOT AN EXACT MATCH with a name in the JSON:
              - ASK the client if they are referring to the product that *does* exist in the JSON and is *most similar* in name.  (See examples below).
              - DO NOT ASSUME that the client wants the JSON product if the name is not exact.
              - DO NOT INVENT products or name variations that are not in the JSON.
  
          [ORDER_FINALIZED]
          DO NOT WRITE [ORDER_FINALIZED] WITHOUT FIRST ASKING IF THE PAYMENT IS CASH OR VIA PAYMENT LINK.
          -1. IT IS MANDATORY TO ASK IF THE PAYMENT WILL BE MADE IN CASH OR VIA PAYMENT LINK WHEN THE ORDER IS COMPLETED.
            - If the user chooses to pay in cash, give them a summary of the order but with [ORDER_FINALIZED_CASH] NOT [ORDER_FINALIZED].
            - If the user chooses to pay via the payment link, give them a summary of the order with [ORDER_FINALIZED].
          0. When you detect that the client wants to finish, use phrases similar to "That's all, thank you", "Nothing more", "That's it", "The bill", etc. (whatever you interpret). ALWAYS put [ORDER_FINALIZED] and then the JSON. Never a single JSON. Or before [ORDER_FINALIZED].
          0.5 If you are going to write [ORDER_FINALIZED], in the same response you do not ask to finalize the order. He is finishing it.
            Example: ¡Entendido! Entonces, ¿finalizamos el pedido? 😊 -> Bad 
            Example: ¡Entendido! Aquí tienes el resumen final de tu pedido: -> Good
          1. You are prohibited from completing an order unless the user has intended to do so.
          2. If you think the client intends to end the deal, then you have to ask them if they want to finish the order.
          3. Avoid asking twice in a row whether to finish the order. You ask and the answer triggers a positive response and you finish the order or they will ask you for something else.
  
          [DETAILS TO TAKE INTO ACCOUNT]
          1. If someone asks you for a coffee and a glass of water, for example, add the glass of water as a note. The same applies if you see similar cases.
          2. In keeping with all of the above, don't forget that you work in the restaurant industry. Try to differentiate when something is explicitly ordered from the menu or when it is an extra. For example, a burger with extra cherries is "EXTRA", but a bottle of wine with two glasses is a "NOTE". So add a note at the item level.
          3. If you have any questions regarding the customer's message, products, extras, modifications, notes, etc., you are fully entitled to ask them to make sure.
          4. In all your answers, avoid writing anything related to the history like "user: I want a coffee" or some JSON. The only thing, when the order is finished, is under [ORDER_FINALIZED]
  
          JSON FORMAT (STRICT!):
          {
            "tableNumber": 0,
            "products": [
              {
                "productId": "Product Id",
                "name": "Product Name",
                "price": 0.00,
                "quantity": 1,
                "modifications": ["no queso", etc],
                "notes": "Notas (STRING, no array)",
                "totalProduct": 0.00
              }
            ],
            "totalOrder": 0.00,
            "notes": "General notes (STRING, no array)"
          }
  
          IMPORTANT: The 'notes' field must be a text (string), NOT an array. If there are no notes, use an empty string ("").
  
          [BEHAVIOR WITH HISTORY]
          1. Never show anything regarding history in your answers.
          2. Never display something like: "user: .." or "assistant: .." in your answers.
          3. Always keep the history of the conversation in mind for your responses.
  
          ${historyContext}
  
          *"REMEMBER! JSON menu products only..."*:
  
          1. *Strengthen search logic:* Ensure JSON menu item search is *accurate* and *category-sensitive*.
          2. *Prioritize the restriction statement:* Raise the priority of the statement of only offering menu items over other features, such as flexibility in search.
          3. *Implement an existence check:* Add a function that explicitly checks if an item exists in the JSON menu before offering it or adding it to the order.
          4. *Improve error handling:* In case an item is not found, provide a clear and concise response, and avoid offering alternatives outside the menu.
  
          Avoid putting things below this line in your answer.
  
          ACTUAL_MESSAGE: "${message}"
        `;
      }

      fullHistory.push({ role: 'assistant', content: systemPrompt });
    } else {
      // Llamadas posteriores: menú e instrucciones omitidas, solo historial
      systemPrompt = `
        
        ${historyContext}

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
    // const response = await openAIService(systemPrompt, userMessage);

    // Registrar el tiempo que tardó la llamada
    console.timeEnd('Gemini API Call Duration');

    // Procesar la respuesta
    try {
      let cleanedResponse = response;

      // Procesamiento básico para verificar si el pedido está finalizado
      if (response.includes('[ORDER_FINALIZED]')) {
        // Extraer datos del pedido para procesar el pedido
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
                productId: product.productId || "unknown_id", // Handle missing productId
                name: product.name,
                quantity: product.quantity || 1,
                price: product.price || 0,
                modifications: product.modifications || [],
                // Handle notes as string instead of array
                notes: typeof product.notes === 'string' ? product.notes : "",
                total: product.totalProduct || (product.price * (product.quantity || 1)),
                promotionApplied: product.promotionApplied || null
                // No category information in the new format
              })),
              total: orderData.totalOrder,
              notes: orderData.notes || "", // General notes at order level
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
      } else if (response.includes('[ORDER_FINALIZED_CASH]')) {
        // Si el pedido se finalizó en efectivo, añadir mensaje de confirmación
        cleanedResponse += "\n\n✅ ¡Pedido finalizado en efectivo! 🎉\n\n🔜 Por favor, espera a que te atiendan para realizar el pago.";
        // Extraer datos del pedido del formato JSON en la respuesta (similar a ORDER_FINALIZED)
        let orderData = extractOrderData(response.replace('[ORDER_FINALIZED_CASH]', '[ORDER_FINALIZED]'));

        if (orderData) {
          // Validar y corregir los cálculos antes de procesar
          orderData = validateOrderCalculations(orderData);

          // Si hay promoción disponible, aplicarla
          if (promotionInfo.available) {
            orderData = applyFirstBuyCoffeePromotion(orderData, promotionInfo);
            orderData = validateOrderCalculations(orderData);
          }

          console.log('Datos del pedido en efectivo extraídos y validados:', orderData);

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
                  ? (product.notes.length > 0 ? product.notes.join(", ") : "")
                  : (product.notes || ""),
                paymentMethod: "cash",
              })),
              total: orderData.totalOrder,
              appliedPromotions: orderData.appliedPromotions || [],
              paymentMethod: "cash",
              paymentStatus: "pending",
              cashWarning: true, // Marca especial para tickets en efectivo
              notes: (orderData.notes || "") + "\n⚠️ PENDIENTE DE PAGO - CONTACTAR CON EL CLIENTE ⚠️"
            };

            // Modificar el numero de mesa si el usuario se equivocó
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

            // Imprimir el ticket inmediatamente con advertencia de pago pendiente
            try {
              // Importar el servicio de impresión de forma dinámica para evitar dependencias circulares
              const { processOrderPrinting } = await import('./printerService.js');

              // Imprimir el ticket con la marca especial
              await processOrderPrinting(savedOrder._id);
              console.log(`Ticket de efectivo enviado a imprimir para el pedido: ${savedOrder._id}`);
            } catch (printError) {
              console.error('Error al imprimir el ticket de efectivo:', printError);
            }

            // Cerrar la sesión del usuario después del pedido en efectivo
            // Obtener el número de WhatsApp del usuario
            const usuario = await User.findById(userId);
            if (usuario && usuario.whatsappNumber) {
              await cerrarSesionDespuesDePedidoEnEfectivo(userId, businessId, usuario.whatsappNumber);
            } else {
              console.error('No se pudo cerrar la sesión: Usuario no encontrado o sin número de WhatsApp');
            }

            // Extraer la parte de la respuesta antes del marcador
            let responseBeforeMarker = response.substring(0, response.indexOf('[ORDER_FINALIZED_CASH]')).trim();

            // Corregir cualquier error en los totales mostrados en la respuesta
            responseBeforeMarker = correctTotalsInResponse(responseBeforeMarker, orderData);

            // Añadir mensaje de confirmación para efectivo
            cleanedResponse = responseBeforeMarker + "\n\n✅ ¡Pedido finalizado en efectivo! 🎉\n\n🔜 Por favor, espera a que te atiendan para realizar el pago.";

            // Cerrar la sesión del usuario después del pedido en efectivo
            await cerrarSesionDespuesDePedidoEnEfectivo(userId, businessId, orderData.whatsappNumber);

          } catch (orderError) {
            console.error('Error al procesar el pedido en efectivo:', orderError);
            // Limpiar respuesta y añadir mensaje de error
            cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED_CASH]')).trim() +
              "\n\n⚠️ Lo siento, ha ocurrido un problema al procesar tu pedido. Por favor, inténtalo de nuevo o contacta con el restaurante.";
          }
        } else {
          // Si no se pudo extraer JSON, solo limpiar la respuesta
          cleanedResponse = response.substring(0, response.indexOf('[ORDER_FINALIZED_CASH]')).trim() +
            "\n\n✅ ¡Pedido finalizado en efectivo! 🎉\n\n🔜 Por favor, espera a que te atiendan para realizar el pago.";
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
    console.log('Extracting order data from response...');
    // Buscar el JSON después del marcador [ORDER_FINALIZED] o [ORDER_FINALIZED_CASH]
    let orderFinalizedIndex = response.indexOf('[ORDER_FINALIZED]');
    let cashOrder = false;

    if (orderFinalizedIndex === -1) {
      orderFinalizedIndex = response.indexOf('[ORDER_FINALIZED_CASH]');
      if (orderFinalizedIndex !== -1) {
        cashOrder = true;
      } else {
        console.log('No [ORDER_FINALIZED] or [ORDER_FINALIZED_CASH] marker found');
        return null;
      }
    }

    // Extract everything after the marker
    const marker = cashOrder ? '[ORDER_FINALIZED_CASH]' : '[ORDER_FINALIZED]';
    let textAfterMarker = response.substring(orderFinalizedIndex + marker.length).trim();
    console.log('Text after marker:', textAfterMarker.substring(0, Math.min(textAfterMarker.length, 100)) + '...');

    // Remove "text" prefix if present
    if (textAfterMarker.startsWith('text')) {
      textAfterMarker = textAfterMarker.substring(4).trim();
    }

    // Try several common patterns for JSON extraction

    // Pattern 1: Markdown code block with json language specifier
    let jsonMatch = textAfterMarker.match(/```json\s*([\s\S]+?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      console.log('Found JSON in markdown code block with json specifier');
      const parsedJson = JSON.parse(jsonMatch[1]);

      // Add payment information for cash orders
      if (cashOrder) {
        parsedJson.paymentMethod = 'cash';
        parsedJson.paymentStatus = 'pending';
      }

      return parsedJson;
    }

    // Pattern 2: Any markdown code block
    jsonMatch = textAfterMarker.match(/```\s*([\s\S]+?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      console.log('Found JSON in generic markdown code block');
      const parsedJson = JSON.parse(jsonMatch[1]);

      // Add payment information for cash orders
      if (cashOrder) {
        parsedJson.paymentMethod = 'cash';
        parsedJson.paymentStatus = 'pending';
      }

      return parsedJson;
    }

    // Pattern 3: Just assume the text after is JSON
    try {
      console.log('Attempting to parse text directly as JSON');
      const parsedJson = JSON.parse(textAfterMarker);

      // Add payment information for cash orders
      if (cashOrder) {
        parsedJson.paymentMethod = 'cash';
        parsedJson.paymentStatus = 'pending';
      }

      return parsedJson;
    } catch (error) {
      console.error('Failed to parse JSON directly:', error.message);
    }

    // No JSON found
    console.error('Could not extract JSON from response');
    return null;
  } catch (error) {
    console.error('Error extracting order data:', error);
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
 * @param {String} [businessCode] - Código del negocio (opcional)
 * @returns {Array|Object} - Array plano de productos simplificados o menú completo según el negocio
 */
function optimizeMenu(menuJSON, businessCode) {
  try {
    // Lista de códigos de negocios que necesitan el menú simplificado
    const simplifiedMenuBusinessCodes = ['102', '103'];

    // Si el negocio está en la lista específica, devolver una estructura simplificada
    if (businessCode && simplifiedMenuBusinessCodes.includes(businessCode.toString())) {
      console.log(`Negocio ${businessCode} requiere menú simplificado`);
      
      // Para estos negocios específicos, usar menú simplificado
      const simplifiedProducts = [];

      // Si menuJSON es un array (estructura actual)
      if (Array.isArray(menuJSON)) {
        // Recorrer cada categoría
        menuJSON.forEach(category => {
          // Si la categoría tiene items
          if (category.items && Array.isArray(category.items)) {
        // Añadir cada item simplificado al array
        category.items.forEach(product => {
          if (businessCode === '103') {
            // Para el negocio 103, incluir información de extras
            simplifiedProducts.push({
          _id: product.id || product._id,
          name: product.name,
          price: product.price,
          category: category.name,
          categoryId: category.id || category._id,
          extras: product.extras ? product.extras.map(extra => ({
            _id: extra.id || extra._id,
            name: extra.name,
            price: extra.price
          })) : []
            });
          } else {
            // Para los demás negocios que usan simplificado, mantener estructura básica
            simplifiedProducts.push({
          _id: product.id || product.__id,
          name: product.name,
          price: product.price,
            });
          }
        });
          }
        });
      }
      // Si menuJSON tiene estructura de objeto con categories
      else if (menuJSON && menuJSON.categories) {
        // Recorrer cada categoría
        menuJSON.categories.forEach(category => {
          // Si la categoría tiene productos
          if (category.products && Array.isArray(category.products)) {
        // Añadir cada producto simplificado al array
        category.products.forEach(product => {
          if (businessCode === '103') {
            // Para el negocio 103, incluir información de extras
            simplifiedProducts.push({
          _id: product._id,
          name: product.name,
          price: product.price,
          category: category.name,
          categoryId: category._id,
          extras: product.extras ? product.extras.map(extra => ({
            _id: extra._id,
            name: extra.name,
            price: extra.price
          })) : []
            });
          } else {
            // Para los demás negocios que usan simplificado, mantener estructura básica
            simplifiedProducts.push({
          _id: product._id,
          name: product.name,
          price: product.price
            });
          }
        });
          }
        });
      }
      
      return simplifiedProducts;
    }
    
    // Para el resto de negocios, usar versión extendida
    const extendedOptimizedProducts = [];

    // Determinar qué estructura de menú estamos manejando
    if (Array.isArray(menuJSON)) {
      // Estructura actual donde menuJSON es un array de categorías
      menuJSON.forEach(category => {
        if (category.items && Array.isArray(category.items)) {
          category.items.forEach(product => {
            extendedOptimizedProducts.push({
              _id: product.id || product._id,
              name: product.name,
              price: product.price,
              category: category.name,
              categoryId: category.id || category._id,
              extras: product.extras ? product.extras.map(extra => ({
                _id: extra.id || extra._id,
                name: extra.name,
                price: extra.price
              })) : []
            });
          });
        }
      });
    }
    else if (menuJSON && menuJSON.categories) {
      // Estructura alternativa con objeto que contiene array de categories
      menuJSON.categories.forEach(category => {
        if (category.products && Array.isArray(category.products)) {
          category.products.forEach(product => {
            extendedOptimizedProducts.push({
              _id: product._id,
              name: product.name,
              price: product.price,
              category: category.name,
              categoryId: category._id,
              extras: product.extras ? product.extras.map(extra => ({
                _id: extra._id,
                name: extra.name,
                price: extra.price
              })) : []
            });
          });
        }
      });
    }

    return extendedOptimizedProducts;

  } catch (error) {
    console.error('Error optimizando menú:', error);
    return []; // En caso de error, devolver array vacío
  }
}

/**
 * Cierra la sesión del usuario después de un pedido en efectivo
 * @param {String} userId - ID del usuario
 * @param {String} businessId - ID del negocio
 * @param {String} whatsappNumber - Número de WhatsApp del usuario
 */
async function cerrarSesionDespuesDePedidoEnEfectivo(userId, businessId, whatsappNumber) {
  try {
    if (!userId || !whatsappNumber) {
      console.log('No se puede cerrar sesión: Faltan datos de usuario');
      return;
    }

    console.log(`Cerrando sesión para el usuario ${whatsappNumber} después del pedido en efectivo`);

    // Obtener datos de la sesión actual de Redis
    const datosSession = await redisClient.get(`session:${whatsappNumber}`);

    if (!datosSession) {
      console.log(`No hay sesión activa para el usuario ${whatsappNumber}`);
      return;
    }

    // Parsear los datos de la sesión
    const session = JSON.parse(datosSession);

    // Guardar la sesión completa en la base de datos antes de cerrarla
    await Session.updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          userId: session.userId,
          startedAt: session.startedAt,
          lastMessageAt: session.lastMessageAt,
          isActive: false, // Marcar como inactiva
          fullHistory: session.fullHistory || [],
          closedAt: new Date(), // Registrar cuándo se cerró
          closedReason: 'cash_payment_completed' // Motivo específico del cierre
        },
      },
      { upsert: true }
    );

    // Eliminar la sesión de Redis
    await redisClient.del(`session:${whatsappNumber}`);

    // Eliminar el menú en caché si existe
    if (businessId) {
      console.log(`Eliminando caché del menú para negocio ${businessId}`);
      await redisClient.del(`menu:${businessId}`);
    }

    // Resetear el businessCode del usuario
    try {
      console.log(`Reseteando businessCode para usuario ${userId}`);
      const updateResult = await User.updateOne(
        { _id: userId },
        { $set: { businessCode: null } }
      );

      console.log(`Resultado de reset businessCode: ${JSON.stringify(updateResult)}`);

      if (updateResult.modifiedCount === 0) {
        console.log(`Advertencia: No se modificó el businessCode del usuario ${userId}`);
      }
    } catch (userUpdateError) {
      console.error('Error al resetear el businessCode del usuario:', userUpdateError);
    }

    // Eliminar número de mesa
    await redisClient.del(`tableNumber:${whatsappNumber}`);

    // Borrar la preferencia del idioma
    await redisClient.del(`userLanguage:${whatsappNumber}`);

    await redisClient.del(`menu:${whatsappNumber}`);

    console.log(`Sesión para el usuario ${whatsappNumber} cerrada correctamente después del pedido en efectivo`);

    // Enviar mensaje final de despedida (opcional)
    setTimeout(async () => {
      try {
        await sendMessage(whatsappNumber,
          'Gracias, ya hemos tomado su pedido, pero el camarero deberá validarlo manualmente, para evitar esta demora la próxima vez puedes pagar con tarjeta y se enviará directo a su preparación.\n\n' +
          'Tu sesión ha finalizado. Si deseas realizar un nuevo pedido, simplemente envía un nuevo mensaje.'
        );

        await sendMessage(whatsappNumber,
          'Si quieres estar al día de lo último, puedes registrarte en www.whats2want.com.'
        );
      } catch (sendError) {
        console.error('Error enviando mensaje de despedida:', sendError);
      }
    }, 3000); // Pequeño retraso para asegurarse de que el mensaje de confirmación de pedido se envía primero

  } catch (error) {
    console.error('Error al cerrar la sesión después del pedido en efectivo:', error);
  }
}