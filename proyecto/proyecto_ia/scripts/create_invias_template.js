const fs = require('fs');
const XLSX = require('../app/lib/xlsx.full.min.js');

function createInviasTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = [];

  // Crear 70 filas con 40 columnas (A a AN)
  for (let r = 0; r < 70; r++) {
    const row = new Array(40).fill('');
    wsData.push(row);
  }

  // Encabezado Institucional INVIAS
  wsData[0][0] = 'REPÚBLICA DE COLOMBIA - MINISTERIO DE TRANSPORTE';
  wsData[1][0] = 'INSTITUTO NACIONAL DE VÍAS - INVIAS';
  wsData[2][0] = 'SUBDIRECCIÓN DE GESTIÓN Y OPERACIÓN DE RED NACIONAL DE CARRETERAS';
  wsData[3][0] = 'REGISTRO FOTOGRÁFICO DE INSPECCIÓN Y SEGUIMIENTO TÉCNICO';

  // Datos del Contrato y Proyecto
  wsData[5][0] = 'CONTRATO DE OBRA / INTERVENTORÍA:';
  wsData[5][7] = 'INVIAS-CT-2026-0842';
  wsData[5][20] = 'CÓDIGO DE PROYECTO:';
  wsData[5][27] = 'PRY-VIAL-COL-9377';

  wsData[6][0] = 'CORREDOR VIAL / TERRITORIAL:';
  wsData[6][7] = 'CORREDOR TRONCAL CENTRAL - TERRITORIAL ANTIOQUIA';
  wsData[6][20] = 'FECHA DE INSPECCIÓN:';
  wsData[6][27] = 'OCTUBRE DE 2026';

  wsData[7][0] = 'TRAMO / SECTOR:';
  wsData[7][7] = 'TRAMO 02: MEDELLÍN - PUERTO TRIUNFO';
  wsData[7][20] = 'ABSCISADO / PR:';
  wsData[7][27] = 'PR 24+500 AL PR 38+200';

  wsData[8][0] = 'CONTRATISTA DE OBRA:';
  wsData[8][7] = 'CONSORCIO VIAL NACIONAL S.A.S.';
  wsData[8][20] = 'INTERVENTORÍA:';
  wsData[8][27] = 'CONSORCIO CONTROL Y GESTIÓN VIAL';

  // Rótulos superiores de fotos 1 y 2
  wsData[16][0] = 'REGISTRO FOTOGRÁFICO #1 - ESTADO DE CALZADA / TALUD';
  wsData[16][20] = 'REGISTRO FOTOGRÁFICO #2 - OBRAS DE ARTE Y DRENAJE';

  // Espacios asignados para fotos 1 y 2 (Filas 18 a 39: celdas A18:T39 y U18:AN39)
  wsData[17][0] = '[ESPACIO ASIGNADO FOTOGRAFÍA #1 - FORMATO INVIAS A18:T39]';
  wsData[17][20] = '[ESPACIO ASIGNADO FOTOGRAFÍA #2 - FORMATO INVIAS U18:AN39]';

  // Metadatos de fotos 1 y 2 (Fila 40: A40:T40 y U40:AN40)
  wsData[39][0] = 'DESCRIPCIÓN: Vista panorámica PR 25+100. Calzada bidireccional en carpeta asfáltica. CTM12: N: 509214 E: 598432';
  wsData[39][20] = 'DESCRIPCIÓN: Cabezal y aletas de alcantarilla PR 28+450 sin obstrucción hidráulica. CTM12: N: 509350 E: 598610';

  // Espacios asignados para fotos 3 y 4 (Filas 41 a 62: celdas A41:T62 y U41:AN62)
  wsData[40][0] = '[ESPACIO ASIGNADO FOTOGRAFÍA #3 - FORMATO INVIAS A41:T62]';
  wsData[40][20] = '[ESPACIO ASIGNADO FOTOGRAFÍA #4 - FORMATO INVIAS U41:AN62]';

  // Metadatos de fotos 3 y 4 (Fila 63: A63:T63 y U63:AN63)
  wsData[62][0] = 'DESCRIPCIÓN: Instalación de defensas metálicas tipo W en curva PR 32+800. CTM12: N: 509520 E: 598840';
  wsData[62][20] = 'DESCRIPCIÓN: Demarcación y aplicación de pintura termoplástica PR 36+200. CTM12: N: 509710 E: 599100';

  // Firmas
  wsData[65][0] = '_____________________________________________';
  wsData[65][20] = '_____________________________________________';
  wsData[66][0] = 'ING. RESIDENTE DE OBRA / CONTRATISTA';
  wsData[66][20] = 'ING. DIRECTOR DE INTERVENTORÍA INVIAS';

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Configuración de celdas combinadas (!merges)
  const merges = [
    // Encabezados
    { s: { c: 0, r: 0 }, e: { c: 39, r: 0 } },  // A1:AN1
    { s: { c: 0, r: 1 }, e: { c: 39, r: 1 } },  // A2:AN2
    { s: { c: 0, r: 2 }, e: { c: 39, r: 2 } },  // A3:AN3
    { s: { c: 0, r: 3 }, e: { c: 39, r: 3 } },  // A4:AN4

    // Fila 6: Contrato
    { s: { c: 0, r: 5 }, e: { c: 6, r: 5 } },   // A6:G6
    { s: { c: 7, r: 5 }, e: { c: 19, r: 5 } },  // H6:T6
    { s: { c: 20, r: 5 }, e: { c: 26, r: 5 } }, // U6:AA6
    { s: { c: 27, r: 5 }, e: { c: 39, r: 5 } }, // AB6:AN6

    // Fila 7: Corredor
    { s: { c: 0, r: 6 }, e: { c: 6, r: 6 } },   // A7:G7
    { s: { c: 7, r: 6 }, e: { c: 19, r: 6 } },  // H7:T7
    { s: { c: 20, r: 6 }, e: { c: 26, r: 6 } }, // U7:AA7
    { s: { c: 27, r: 6 }, e: { c: 39, r: 6 } }, // AB7:AN7

    // Fila 8: Tramo
    { s: { c: 0, r: 7 }, e: { c: 6, r: 7 } },   // A8:G8
    { s: { c: 7, r: 7 }, e: { c: 19, r: 7 } },  // H8:T8
    { s: { c: 20, r: 7 }, e: { c: 26, r: 7 } }, // U8:AA7
    { s: { c: 27, r: 7 }, e: { c: 39, r: 7 } }, // AB8:AN7

    // Fila 9: Contratista
    { s: { c: 0, r: 8 }, e: { c: 6, r: 8 } },   // A9:G9
    { s: { c: 7, r: 8 }, e: { c: 19, r: 8 } },  // H9:T9
    { s: { c: 20, r: 8 }, e: { c: 26, r: 8 } }, // U9:AA9
    { s: { c: 27, r: 8 }, e: { c: 39, r: 8 } }, // AB9:AN9

    // Fila 17: Rótulo Fotos 1 y 2
    { s: { c: 0, r: 16 }, e: { c: 19, r: 16 } }, // A17:T17
    { s: { c: 20, r: 16 }, e: { c: 39, r: 16 } }, // U17:AN17

    // FOTO 1 y 2: A18:T39 y U18:AN39 (20 cols x 22 rows = 440 celdas c/u)
    { s: { c: 0, r: 17 }, e: { c: 19, r: 38 } }, // A18:T39
    { s: { c: 20, r: 17 }, e: { c: 39, r: 38 } }, // U18:AN39

    // Fila 40: Metadatos Fotos 1 y 2
    { s: { c: 0, r: 39 }, e: { c: 19, r: 39 } }, // A40:T40
    { s: { c: 20, r: 39 }, e: { c: 39, r: 39 } }, // U40:AN40

    // FOTO 3 y 4: A41:T62 y U41:AN62 (20 cols x 22 rows = 440 celdas c/u)
    { s: { c: 0, r: 40 }, e: { c: 19, r: 61 } }, // A41:T62
    { s: { c: 20, r: 40 }, e: { c: 39, r: 61 } }, // U41:AN62

    // Fila 63: Metadatos Fotos 3 y 4
    { s: { c: 0, r: 62 }, e: { c: 19, r: 62 } }, // A63:T63
    { s: { c: 20, r: 62 }, e: { c: 39, r: 62 } }, // U63:AN63

    // Firmas
    { s: { c: 0, r: 65 }, e: { c: 19, r: 65 } }, // A66:T66
    { s: { c: 20, r: 65 }, e: { c: 39, r: 65 } }, // U66:AN66
    { s: { c: 0, r: 66 }, e: { c: 19, r: 66 } }, // A67:T67
    { s: { c: 20, r: 66 }, e: { c: 39, r: 66 } }  // U67:AN67
  ];

  ws['!merges'] = merges;

  // Ajustar anchos de columnas: 40 columnas con ancho estándar
  const colWidths = [];
  for (let c = 0; c < 40; c++) {
    colWidths.push({ wch: 3.2 });
  }
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'FORMATO_INVIAS');

  const outPath = 'plantillas_ejemplo/Formato_Registro_Fotografico_INVIAS.xlsx';
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  fs.writeFileSync(outPath, buffer);
  console.log('Plantilla oficial INVIAS creada con éxito en:', outPath);
  console.log('Tamaño de archivo:', buffer.length, 'bytes');
}

createInviasTemplate();
