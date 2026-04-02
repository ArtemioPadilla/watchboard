#!/usr/bin/env python3
"""
Generate Spanish (Latin American) translations for all tracker meta.json and kpis.json files.

Creates trackers/{slug}/data-es/meta.json and trackers/{slug}/data-es/kpis.json
for every non-draft tracker.

Translation rules:
- Professional Latin American Spanish (not Castilian)
- Keep proper nouns, organization names, country names as-is
- Keep acronyms (use Spanish versions where common: NATO->OTAN, UN->ONU)
- Keep source names untranslated (Reuters, AP, BBC, etc.)
- Keep numbers, dates, coordinates as-is
- Preserve <br> tags in heroHeadline
"""

import json
import os
import re
import sys
from pathlib import Path

TRACKERS_DIR = Path(__file__).parent.parent / "trackers"

# ---------------------------------------------------------------------------
# KPI LABEL TRANSLATIONS — 499 unique labels mapped to Latin American Spanish
# ---------------------------------------------------------------------------
KPI_LABEL_MAP: dict[str, str] = {
    # --- A ---
    '"Big Beautiful Bill" Deficit Impact': 'Impacto en el Déficit del "Big Beautiful Bill"',
    "1988 Plebiscite 'No' Vote": "Voto 'No' en el Plebiscito de 1988",
    "2006 Election Margin (Calderón–AMLO)": "Margen Electoral 2006 (Calderón–AMLO)",
    "2022 Total Touring Gross": "Recaudación Total de Giras 2022",
    "2025 Humanitarian Plan Funded": "Plan Humanitario 2025 Financiado",
    "287(g) MOAs Active": "Acuerdos 287(g) Activos",
    "9/11 Insurance Claims Paid": "Reclamaciones de Seguros del 11-S Pagadas",
    "ADIZ Incursions (2022)": "Incursiones en la ADIZ (2022)",
    "ALPS-Treated Water Discharged": "Agua Tratada por ALPS Descargada",
    "AMLO 2018 Victory Margin": "Margen de Victoria de AMLO 2018",
    "AMLO Exit Approval Rating": "Aprobación de AMLO al Salir",
    "AMLO's 2018 Election Margin": "Margen Electoral de AMLO en 2018",
    "AUKUS Submarine Program Cost": "Costo del Programa de Submarinos AUKUS",
    "AUSSOM Authorized Strength": "Fuerza Autorizada de AUSSOM",
    "Active Cartel Organizations": "Organizaciones de Cárteles Activas",
    "Active Gangs Nationwide": "Pandillas Activas a Nivel Nacional",
    "Active ICC Arrest Warrants": "Órdenes de Arresto de la CPI Activas",
    "Active Starlink Satellites": "Satélites Starlink Activos",
    "Acutely Food Insecure": "En Inseguridad Alimentaria Aguda",
    "Additional People in Extreme Poverty (2020)": "Personas Adicionales en Pobreza Extrema (2020)",
    "Afghan Civilians Killed (2009–2024)": "Civiles Afganos Muertos (2009–2024)",
    "Afghan Girls Banned from School (Grades 7+)": "Niñas Afganas Excluidas de la Escuela (Grado 7+)",
    "Afghan Refugees & IDPs": "Refugiados y Desplazados Afganos",
    "Afghan Security Forces Killed (2001–2021)": "Fuerzas de Seguridad Afganas Muertos (2001–2021)",
    "Afghans Needing Humanitarian Aid": "Afganos que Necesitan Ayuda Humanitaria",
    "Africans Enslaved and Transported (1500–1900)": "Africanos Esclavizados y Transportados (1500–1900)",
    "Aid Trucks Entering Gaza (daily avg)": "Camiones de Ayuda Entrando a Gaza (prom. diario)",
    "Aid Workers Killed": "Trabajadores Humanitarios Muertos",
    "Air Attacks Documented (2025)": "Ataques Aéreos Documentados (2025)",
    "Aircraft Produced (Allied)": "Aviones Producidos (Aliados)",
    "Al-Shabaab Annual Revenue": "Ingresos Anuales de Al-Shabaab",
    "Al-Shabaab Territorial Control": "Control Territorial de Al-Shabaab",
    "Alamo Defenders Killed": "Defensores del Álamo Muertos",
    "All-Time Spotify Streams": "Reproducciones Totales en Spotify",
    "Alliance of Sahel States Members": "Miembros de la Alianza de Estados del Sahel",
    "Allied Ships Sunk by U-boats": "Barcos Aliados Hundidos por Submarinos",
    "Alternatives to Detention (ATD)": "Alternativas a la Detención (ATD)",
    "Annual Conflict Events (ACLED)": "Eventos de Conflicto Anuales (ACLED)",
    "Annual Cost of Violence to Mexico Economy": "Costo Anual de la Violencia para la Economía Mexicana",
    "Annual Inflation": "Inflación Anual",
    "Annual SCS Trade Value": "Valor Comercial Anual del Mar de China Meridional",
    "Approval Rating (Nov 2018)": "Aprobación (Nov 2018)",
    "Artemis Accords Signatories": "Signatarios de los Acuerdos Artemis",
    "Artemis I Mission Duration": "Duración de la Misión Artemis I",
    "Artemis II Target Launch": "Lanzamiento Objetivo de Artemis II",
    "Astronauts Launched to ISS": "Astronautas Lanzados a la EEI",
    "Atahualpa's Ransom (1532–33)": "Rescate de Atahualpa (1532–33)",
    "Average US Tariff Rate (Feb 2026)": "Tasa Arancelaria Promedio de EE.UU. (Feb 2026)",
    "Avg Annual GDP Growth (Sexenio)": "Crecimiento Anual Promedio del PIB (Sexenio)",
    "Avg. Annual GDP Growth (2013–2018)": "Crecimiento Anual Promedio del PIB (2013–2018)",
    "Avg. GDP Growth 2001–2006": "Crecimiento Promedio del PIB 2001–2006",
    "Ayotzinapa Students Disappeared": "Estudiantes de Ayotzinapa Desaparecidos",

    # --- B ---
    "BRP Sierra Madre Marine Garrison": "Guarnición Marina del BRP Sierra Madre",
    "Balikatan 2025 Participating Troops": "Tropas Participantes en Balikatan 2025",
    "Ballistic Missiles Fired (Aug 2022)": "Misiles Balísticos Lanzados (Ago 2022)",
    "Banxico Policy Rate": "Tasa de Política de Banxico",
    "Battle of San Jacinto Duration": "Duración de la Batalla de San Jacinto",
    "Battle of Verdun Casualties": "Bajas en la Batalla de Verdún",
    "Battle of the Somme Casualties": "Bajas en la Batalla del Somme",
    "Bay of Pigs Prisoners Ransomed": "Prisioneros de Bahía de Cochinos Rescatados",
    "Bell Inequality: Violated": "Desigualdad de Bell: Violada",
    "Billboard 200 No. 1 Albums": "Álbumes No. 1 en Billboard 200",
    "Billboard Hot 100 Career Entries": "Entradas en el Billboard Hot 100",
    "Billboard Hot 100 No. 1 Hits": "Éxitos No. 1 en el Billboard Hot 100",
    "Billboard Music Awards Won": "Premios Billboard Music Awards Ganados",
    "Blue Origin HLS Contract Value": "Valor del Contrato HLS de Blue Origin",
    "Brent Crude": "Petróleo Brent",
    "Brent Crude Oil Price (Mar 20, 2026)": "Precio del Petróleo Brent (20 Mar 2026)",
    "Burkina Faso Govt Territory Control": "Control Territorial del Gobierno de Burkina Faso",
    "ByteDance Revenue (2024)": "Ingresos de ByteDance (2024)",

    # --- C ---
    "CJNG Assets Subject to U.S. Forfeiture": "Activos del CJNG Sujetos a Decomiso de EE.UU.",
    "CJNG HVTs Extradited/Captured": "Objetivos de Alto Valor del CJNG Extraditados/Capturados",
    "Calderón 2006 Margin": "Margen de Calderón 2006",
    "Caravan of Death Victims": "Víctimas de la Caravana de la Muerte",
    "Career Album Sales (Equivalent)": "Ventas de Álbumes en Carrera (Equivalente)",
    "Cartel Gunmen Mobilized (2019)": "Sicarios del Cártel Movilizados (2019)",
    "Childhood Thyroid Cancer Cases": "Casos de Cáncer de Tiroides Infantil",
    "Children Among Victims": "Niños entre las Víctimas",
    "Children Out of School": "Niños Fuera de la Escuela",
    "Children with Acute Malnutrition": "Niños con Desnutrición Aguda",
    "Chileans Forced into Exile": "Chilenos Forzados al Exilio",
    "China Coast Guard Vessels": "Embarcaciones de la Guardia Costera de China",
    "China Defense Budget 2024 (Official)": "Presupuesto de Defensa de China 2024 (Oficial)",
    "China EV Exports (2023)": "Exportaciones de Vehículos Eléctricos de China (2023)",
    "China GDP Forecast 2025": "Pronóstico del PIB de China 2025",
    "China IC Fund Total (Phases I–III)": "Fondo de CI de China Total (Fases I–III)",
    "China Maritime Militia Vessels (Spratlys)": "Embarcaciones de la Milicia Marítima China (Spratly)",
    "China Private AI Investment (2024)": "Inversión Privada en IA de China (2024)",
    "China R&D Spending (% of GDP)": "Gasto en I+D de China (% del PIB)",
    "China Semiconductor Imports (2023)": "Importaciones de Semiconductores de China (2023)",
    "China's Artificial Island Reclamation": "Recuperación de Islas Artificiales de China",
    "China's Global AI Patent Share": "Participación Global de Patentes de IA de China",
    "Ciudad Juárez Homicides (2010 peak)": "Homicidios en Ciudad Juárez (pico 2010)",
    "Civilian Deaths": "Muertes de Civiles",
    "Civilian Deaths (est.)": "Muertes de Civiles (est.)",
    "Civilians Killed (AAPP)": "Civiles Muertos (AAPP)",
    "Clandestine Mass Graves Found": "Fosas Clandestinas Encontradas",
    "Claudia Sheinbaum 2024 Vote Share": "Porcentaje de Votos de Claudia Sheinbaum 2024",
    "Coalition Troops Killed": "Tropas de la Coalición Muertos",
    "Colima Homicide Rate (per 100k)": "Tasa de Homicidios de Colima (por 100k)",
    "Communities & Bases Attacked": "Comunidades y Bases Atacadas",
    "Competitive Presidential Elections": "Elecciones Presidenciales Competitivas",
    "Confirmed COVID-19 Deaths": "Muertes Confirmadas por COVID-19",
    "Confirmed Cases Worldwide": "Casos Confirmados a Nivel Mundial",
    "Confirmed Dead (Official)": "Muertos Confirmados (Oficial)",
    "Confirmed Torture Survivors": "Sobrevivientes de Tortura Confirmados",
    "Confirmed US Airstrikes (2007–2025)": "Ataques Aéreos de EE.UU. Confirmados (2007–2025)",
    "Conflict Deaths in J&K Since 1989": "Muertes por Conflicto en J&K Desde 1989",
    "Corruption Perceptions Index 2018": "Índice de Percepción de Corrupción 2018",
    "Cortés's Force at Tenochtitlan (with allies)": "Fuerza de Cortés en Tenochtitlan (con aliados)",
    "Countries / Territories Affected": "Países / Territorios Afectados",
    "Countries Affected": "Países Afectados",
    "Countries Under US Travel Ban": "Países Bajo Prohibición de Viaje de EE.UU.",
    "Criminal Cases vs. Pinochet at Death": "Casos Penales contra Pinochet al Morir",
    "Cruise Altitude at Impact (ft)": "Altitud de Crucero al Impacto (ft)",
    "Cuban Medical Workers Abroad": "Trabajadores Médicos Cubanos en el Exterior",
    "Cuban Missile Crisis Duration": "Duración de la Crisis de los Misiles de Cuba",
    "Cubans Emigrated Since 1959": "Cubanos Emigrados Desde 1959",
    "Cumulative Embargo Cost (Cuba est.)": "Costo Acumulado del Embargo (est. Cuba)",
    "Current Detention Population": "Población Actual en Detención",
    "Current Restricted Area": "Área Restringida Actual",

    # --- D ---
    "DOGE Claimed Savings": "Ahorros Reclamados por DOGE",
    "Days Since Coup": "Días Desde el Golpe",
    "Days Since Debut": "Días Desde el Debut",
    "Days Since El Mencho Killed": "Días Desde la Muerte de El Mencho",
    "Days Since Massacre": "Días Desde la Masacre",
    "Days Since US Invasion": "Días Desde la Invasión de EE.UU.",
    "Days of Conflict": "Días de Conflicto",
    "Days of Full-Scale Invasion": "Días de Invasión a Gran Escala",
    "Days of Open Civil War": "Días de Guerra Civil Abierta",
    "Days to Kickoff": "Días para el Inicio",
    "Days to Olympics at Time of Massacre": "Días para los Olímpicos al Momento de la Masacre",
    "Days: Crash to Verdict": "Días: del Impacto al Veredicto",
    "Days: Genome Share → First EUA Vaccine": "Días: Publicación del Genoma → Primera Vacuna EUA",
    "Deaths Attributed to Operation Condor": "Muertes Atribuidas a la Operación Cóndor",
    "Deaths in Custody (FY2026, partial)": "Muertes en Custodia (AF2026, parcial)",
    "Deaths in El Salvador Civil War (1979–1992)": "Muertes en la Guerra Civil de El Salvador (1979–1992)",
    "Deaths in Guatemalan Civil War (1960–1996)": "Muertes en la Guerra Civil de Guatemala (1960–1996)",
    "Deaths in ICE Custody (FY2025)": "Muertes en Custodia de ICE (AF2025)",
    "Deaths in Nicaragua Contra War (1981–1990)": "Muertes en la Guerra de los Contras de Nicaragua (1981–1990)",
    "Deaths in Potosí Mita Labor System (est.)": "Muertes en el Sistema de Mita de Potosí (est.)",
    "Declassified US Documents": "Documentos Desclasificados de EE.UU.",
    "Decommissioning Target": "Meta de Desmantelamiento",
    "DeepSeek V3 Training Cost": "Costo de Entrenamiento de DeepSeek V3",
    "Detained After Massacre": "Detenidos Después de la Masacre",
    "Detainees in Private Prisons": "Detenidos en Prisiones Privadas",
    "Detainees w/ No Criminal Conviction": "Detenidos Sin Condena Penal",
    "Disappeared in Argentina's Dirty War (1976–1983)": "Desaparecidos en la Guerra Sucia de Argentina (1976–1983)",
    "Disaster-Related Deaths (Fukushima Pref.)": "Muertes Relacionadas con el Desastre (Pref. Fukushima)",
    "Displaced Children": "Niños Desplazados",
    "Displaced During 1947 Partition": "Desplazados Durante la Partición de 1947",
    "Displaced Palestinians": "Palestinos Desplazados",
    "Displaced People in Gaza": "Personas Desplazadas en Gaza",
    "Displaced Persons (post-war)": "Personas Desplazadas (posguerra)",
    "Displaced Ukrainians": "Ucranianos Desplazados",
    "Documented US Military Interventions (1898–2023)": "Intervenciones Militares Documentadas de EE.UU. (1898–2023)",
    "Drug War Deaths (2006–2012)": "Muertes en la Guerra contra el Narco (2006–2012)",
    "Duration (European Theater)": "Duración (Teatro Europeo)",
    "Duration of Conquest Era": "Duración de la Era de la Conquista",
    "Duration of Pinochet Regime": "Duración del Régimen de Pinochet",
    "Dutch Victims": "Víctimas Holandesas",

    # --- E ---
    "ECB Deposit Facility Rate": "Tasa de Facilidad de Depósito del BCE",
    "EU ReArm Europe Defense Fund": "Fondo de Defensa ReArm Europe de la UE",
    "Est. Political Prisoners (1973–1990)": "Presos Políticos Est. (1973–1990)",
    "Est. Total Decommissioning Cost": "Costo Total Est. de Desmantelamiento",
    "Estimated Cancer Deaths (UNSCEAR/WHO)": "Muertes por Cáncer Estimadas (UNSCEAR/OMS)",
    "Estimated Cost of U.S. War on Terror": "Costo Estimado de la Guerra contra el Terror de EE.UU.",
    "Estimated Dead (Researchers)": "Muertos Estimados (Investigadores)",
    "Estimated Deaths": "Muertes Estimadas",
    "Estimated European NATO Underinvestment Since 2014": "Subinversión Estimada de la OTAN Europea Desde 2014",
    "Estimated Excess Deaths (2020–2021)": "Exceso de Muertes Estimado (2020–2021)",
    "Estimated Indigenous Languages at Contact": "Lenguas Indígenas Estimadas al Contacto",
    "Estimated Melted Fuel Debris (Units 1–3)": "Escombros de Combustible Fundido Estimados (Unidades 1–3)",
    "Exclusion Zone Area": "Área de la Zona de Exclusión",
    "Executive Orders (2nd Term)": "Órdenes Ejecutivas (2do Mandato)",
    "Expected Global Viewers": "Espectadores Globales Esperados",
    "Expected International Visitors": "Visitantes Internacionales Esperados",
    "Extraditions to the United States": "Extradiciones a Estados Unidos",

    # --- F ---
    "FDI (Jan–Sep 2025)": "IED (Ene–Sep 2025)",
    "FDI Inflow Peak (2001)": "Pico de Entrada de IED (2001)",
    "FIFA Projected Revenue": "Ingresos Proyectados por la FIFA",
    "FY2021 Removals (Biden low)": "Deportaciones AF2021 (mínimo de Biden)",
    "FY2024 Administrative Arrests": "Arrestos Administrativos AF2024",
    "Facing Famine (IPC5)": "En Riesgo de Hambruna (IPC5)",
    "Falcon 9 Cost per kg to LEO": "Costo de Falcon 9 por kg a LEO",
    "Falcon 9 Mission Success Rate": "Tasa de Éxito de Misión de Falcon 9",
    "Families Displaced": "Familias Desplazadas",
    "Fed Funds Rate": "Tasa de Fondos Federales",
    "Federal Budget Deficit (2024)": "Déficit Presupuestario Federal (2024)",
    "Federal Police Force (founded 2009)": "Policía Federal (fundada 2009)",
    "Federal Workforce Reduction (2025)": "Reducción de la Fuerza Laboral Federal (2025)",
    "Fentanyl Kg Price (Culiacán)": "Precio del Fentanilo por Kg (Culiacán)",
    "Fentanyl Pills Seized (2025 YTD)": "Pastillas de Fentanilo Decomisadas (2025 acum.)",
    "Filipino Fishers Displaced": "Pescadores Filipinos Desplazados",
    "Final Ticket Top Price (Resale)": "Precio Máximo de Boleto en Reventa",
    "First Crewed Lunar Landing Target": "Meta de Primer Alunizaje Tripulado",
    "First Responders Killed": "Primeros Respondientes Muertos",
    "Flights Cancelled": "Vuelos Cancelados",
    "Food Insecure Population": "Población en Inseguridad Alimentaria",
    "Food Insecure — Sahel Region": "Inseguridad Alimentaria — Región del Sahel",
    "Foreign Nationals Killed": "Ciudadanos Extranjeros Muertos",
    "Fox 2000 Victory Margin": "Margen de Victoria de Fox 2000",
    "Fox Victory Margin (2000)": "Margen de Victoria de Fox (2000)",
    "Frozen Russian State Assets": "Activos Estatales Rusos Congelados",
    "Full-Time Job Equivalent Losses (2020)": "Pérdida de Empleos de Tiempo Completo (2020)",

    # --- G ---
    "GDP Contraction (2009 recession)": "Contracción del PIB (recesión 2009)",
    "GDP Decline in 1975 (Shock Therapy)": "Caída del PIB en 1975 (Terapia de Shock)",
    "GDP Decline — Special Period (1990–93)": "Caída del PIB — Período Especial (1990–93)",
    "GDP Growth (2025)": "Crecimiento del PIB (2025)",
    "GDP Growth Rate (2025)": "Tasa de Crecimiento del PIB (2025)",
    "GIEI Reports Published": "Informes del GIEI Publicados",
    "Gang-Controlled Capital": "Capital Controlada por Pandillas",
    "Gaza Deaths Since Oct 7": "Muertes en Gaza Desde Oct 7",
    "Gaza Fence Breach Points": "Puntos de Brecha en la Valla de Gaza",
    "Gaza Reconstruction Cost Estimate": "Estimación del Costo de Reconstrucción de Gaza",
    "German Total Deaths (est.)": "Total de Muertes Alemanas (est.)",
    "Germany Defense Spending (% GDP)": "Gasto de Defensa de Alemania (% PIB)",
    "Germany Special Defense Fund (Sondervermögen)": "Fondo Especial de Defensa de Alemania (Sondervermögen)",
    "Global Equivalent Album Sales": "Ventas Globales Equivalentes de Álbumes",
    "Global GDP Contraction (2020)": "Contracción del PIB Global (2020)",
    "Global GDP Forecast 2026": "Pronóstico del PIB Global 2026",
    "Global Policy Uncertainty Index": "Índice Global de Incertidumbre Política",
    "Global Quantum Market (2024)": "Mercado Cuántico Global (2024)",
    "Goliad Massacre Victims": "Víctimas de la Masacre de Goliad",
    "Grammy Award Nominations": "Nominaciones a los Premios Grammy",
    "Grammy Awards Won": "Premios Grammy Ganados",
    "Group Stage Groups": "Grupos de la Fase de Grupos",
    "Guinness World Records Held": "Récords Guinness Vigentes",
    "Gulf Region Killed": "Muertos en la Región del Golfo",

    # --- H ---
    "Hamas Fighters Infiltrated Israel": "Combatientes de Hamas Infiltrados en Israel",
    "Health Facilities Destroyed": "Instalaciones de Salud Destruidas",
    "Healthcare Facilities Damaged/Destroyed": "Instalaciones de Salud Dañadas/Destruidas",
    "Holocaust Victims": "Víctimas del Holocausto",
    "Homicide Rate (per 100k)": "Tasa de Homicidios (por 100k)",
    "Homicide Rate 2018 (per 100k)": "Tasa de Homicidios 2018 (por 100k)",
    "Homicides Since Sep 9, 2024": "Homicidios Desde Sep 9, 2024",
    "Homicides in 2023": "Homicidios en 2023",
    "Host Cities": "Ciudades Sede",
    "Hostages Remaining in Gaza": "Rehenes Restantes en Gaza",
    "Hostages Taken Oct 7": "Rehenes Tomados el 7 Oct",
    "Hostages Taken to Gaza": "Rehenes Llevados a Gaza",
    "Hot Latin Songs Career Entries": "Entradas en Hot Latin Songs",
    "Huawei Revenue (2024)": "Ingresos de Huawei (2024)",

    # --- I ---
    "ICE FY2024 Budget": "Presupuesto de ICE AF2024",
    "ICE Total Personnel": "Personal Total de ICE",
    "IDF Soldiers Killed (Gaza War)": "Soldados de las FDI Muertos (Guerra de Gaza)",
    "IDF Soldiers Killed (Oct 7)": "Soldados de las FDI Muertos (7 Oct)",
    "IDF Soldiers Killed (War Total)": "Soldados de las FDI Muertos (Total de la Guerra)",
    "IDPs — Burkina Faso": "Desplazados Internos — Burkina Faso",
    "IFPI Global Recording Artist of the Year": "Artista del Año IFPI Global",
    "ISIS-K Attacks (2021–2024)": "Ataques de ISIS-K (2021–2024)",
    "In Acute Food Insecurity": "En Inseguridad Alimentaria Aguda",
    "In IPC Phase 5 (Catastrophe)": "En Fase 5 de la CIF (Catástrofe)",
    "In Need of Aid": "Necesitados de Ayuda",
    "India Defense Budget FY2024–25": "Presupuesto de Defensa de India AF2024–25",
    "India-Pakistan Bilateral Trade (2023)": "Comercio Bilateral India-Pakistán (2023)",
    "Indian Nuclear Warheads (est.)": "Ojivas Nucleares de India (est.)",
    "Indian Soldiers Killed — Kargil War (1999)": "Soldados Indios Muertos — Guerra de Kargil (1999)",
    "Indigenous Population (Pre-Contact c.1491)": "Población Indígena (Pre-Contacto c.1491)",
    "Indigenous Population Loss (1492–1600)": "Pérdida de Población Indígena (1492–1600)",
    "Inflation Peak (Aug–Sep 2022)": "Pico de Inflación (Ago–Sep 2022)",
    "Inflation Rate (2006 vs 2000)": "Tasa de Inflación (2006 vs 2000)",
    "Intercontinental Play-offs": "Repescas Intercontinentales",
    "Internally Displaced Persons": "Personas Desplazadas Internamente",
    "Iran Killed": "Muertos en Irán",
    "Iran War Casualties (Day 21)": "Bajas de la Guerra de Irán (Día 21)",
    "Israel Killed": "Muertos en Israel",
    "Israeli Settlers in West Bank": "Colonos Israelíes en Cisjordania",
    "Israelis Killed (Oct 7 Attack)": "Israelíes Muertos (Ataque del 7 Oct)",
    "Israelis Killed (Oct 7)": "Israelíes Muertos (7 Oct)",

    # --- J ---
    "JIT Member States": "Estados Miembros del JIT",
    "JNIM Attack Deaths (2024)": "Muertes por Ataques del JNIM (2024)",
    "Jan. 6 Pardons Issued": "Indultos del 6 de Enero Emitidos",
    "Journalists Killed (6-Year Term)": "Periodistas Muertos (Sexenio)",

    # --- K ---
    "Killed & Disappeared": "Muertos y Desaparecidos",
    "Killed Night of Attack": "Muertos la Noche del Ataque",
    "Killed in 2024": "Muertos en 2024",
    "Killed in Sinaloa Civil War (Sep 2024–Aug 2025)": "Muertos en la Guerra Civil de Sinaloa (Sep 2024–Ago 2025)",
    "Killed — Jan 2023 Operation Ovidio": "Muertos — Operación Ovidio Ene 2023",
    "Killed — Oct 2019 Culiacanazo": "Muertos — Culiacanazo Oct 2019",
    "Known DINA Detention/Torture Sites": "Sitios de Detención/Tortura de la DINA Conocidos",

    # --- L ---
    "LOC Ceasefire Violations (2024)": "Violaciones del Alto al Fuego en la LOC (2024)",
    "LOC Violations Recorded (2020)": "Violaciones de la LOC Registradas (2020)",
    "La Mayiza Territory Control": "Control Territorial de La Mayiza",
    "Largest Quantum Processor": "Procesador Cuántico Más Grande",
    "Latin American Countries Targeted by US Covert/Military Ops": "Países Latinoamericanos Objetivo de Operaciones Encubiertas/Militares de EE.UU.",
    "Latin Grammy Awards Won": "Premios Latin Grammy Ganados",
    "Lebanon Killed": "Muertos en Líbano",
    "Life Sentences (in absentia)": "Cadenas Perpetuas (en ausencia)",
    "Line of Control Length": "Longitud de la Línea de Control",
    "Liquidators Deployed": "Liquidadores Desplegados",
    "Literacy Rate (UNESCO)": "Tasa de Alfabetización (UNESCO)",
    "Love Yourself Tour Gross": "Recaudación de Love Yourself Tour",

    # --- M ---
    "MINUSMA Total Deaths (2013–2023)": "Muertes Totales de MINUSMA (2013–2023)",
    "MSS/GSF Personnel Deployed": "Personal MSS/GSF Desplegado",
    "Major Engagements": "Enfrentamientos Importantes",
    "Major Investigations": "Investigaciones Principales",
    "Mariel Boatlift Emigrants (1980)": "Emigrantes del Éxodo del Mariel (1980)",
    "Mass Graves Discovered": "Fosas Comunes Descubiertas",
    "Max Single Booster Reflights": "Máximo de Reutilizaciones de un Solo Propulsor",
    "Median Line Crossing Days (2024)": "Días de Cruce de la Línea Media (2024)",
    "Mexican Military Deaths": "Muertes de Militares Mexicanos",
    "Mexican States with CJNG Presence": "Estados Mexicanos con Presencia del CJNG",
    "Mexico Homicides Declined in 2025": "Homicidios en México Disminuyeron en 2025",
    "Mexico's Territory Lost": "Territorio Perdido por México",
    "Military Deaths": "Muertes Militares",
    "Military Deaths (est.)": "Muertes Militares (est.)",
    "Military Officers Charged": "Oficiales Militares Acusados",
    "Military Troops Deployed": "Tropas Militares Desplegadas",
    "Minimum Wage Increase (2018–2024)": "Aumento del Salario Mínimo (2018–2024)",
    "Mobile Internet Penetration": "Penetración de Internet Móvil",
    "Morena Founded": "Morena Fundada",
    "Mérida Initiative US Funding (FY2008–10)": "Financiamiento de EE.UU. de la Iniciativa Mérida (AF2008–10)",

    # --- N ---
    "NATO Agreed Spending Target (by 2035)": "Meta de Gasto Acordada por la OTAN (para 2035)",
    "NATO Average Defense Spending (% GDP)": "Gasto de Defensa Promedio de la OTAN (% PIB)",
    "NATO Member States": "Estados Miembros de la OTAN",
    "NATO Members Meeting 2% GDP Target": "Miembros de la OTAN que Cumplen la Meta del 2% del PIB",
    "NATO Total Annual Defense Spending": "Gasto Anual Total de Defensa de la OTAN",
    "Named Quantum Interpretations": "Interpretaciones Cuánticas Nombradas",
    "National Poverty Rate (2018)": "Tasa de Pobreza Nacional (2018)",
    "National Stadium Detainees (Sep 1973)": "Detenidos en el Estadio Nacional (Sep 1973)",
    "Nationalities on Board": "Nacionalidades a Bordo",
    "Nations Involved": "Naciones Involucradas",
    "Nations Whose Citizens Were Killed": "Naciones cuyos Ciudadanos Fueron Muertos",
    "Nations with Quantum Programs": "Naciones con Programas Cuánticos",
    "New Safe Confinement Cost": "Costo del Nuevo Confinamiento Seguro",
    "Nobel Prizes for Quantum Work": "Premios Nobel por Trabajo Cuántico",
    "Nvidia Revenue from China (FY2024)": "Ingresos de Nvidia desde China (AF2024)",

    # --- O ---
    "Official Direct Deaths": "Muertes Directas Oficiales",
    "Oportunidades Program Beneficiaries": "Beneficiarios del Programa Oportunidades",
    "Orion Deep Space Distance Record": "Récord de Distancia de Orion en Espacio Profundo",
    "Ovidio Forfeiture (U.S. Plea Deal)": "Decomiso de Ovidio (Acuerdo con EE.UU.)",

    # --- P ---
    "PHEIC Duration": "Duración de ESPII",
    "PLA Aircraft Sorties (2024)": "Salidas Aéreas del EPL (2024)",
    "PLA Vessels/Aircraft (Mar 2026 Resumption)": "Embarcaciones/Aeronaves del EPL (Reanudación Mar 2026)",
    "PLA Warships Deployed (Peak — May 2024)": "Buques de Guerra del EPL Desplegados (Pico — May 2024)",
    "Pakistan Defense Budget FY2024": "Presupuesto de Defensa de Pakistán AF2024",
    "Pakistani Nuclear Warheads (est.)": "Ojivas Nucleares de Pakistán (est.)",
    "Palestinians Killed (Gaza)": "Palestinos Muertos (Gaza)",
    "Palestinians Wounded (Gaza)": "Palestinos Heridos (Gaza)",
    "Peak Annual Removals (FY2013)": "Pico Anual de Deportaciones (AF2013)",
    "Peak Evacuees (2011)": "Pico de Evacuados (2011)",
    "Peak Soviet Annual Subsidies": "Pico de Subsidios Anuales Soviéticos",
    "Pemex Oil Production (end of sexenio)": "Producción Petrolera de Pemex (fin de sexenio)",
    "Pemex Total Debt": "Deuda Total de Pemex",
    "People Displaced": "Personas Desplazadas",
    "People Evacuated & Resettled": "Personas Evacuadas y Reubicadas",
    "People Lifted from Poverty": "Personas Sacadas de la Pobreza",
    "Persons Disappeared": "Personas Desaparecidas",
    "Peso / USD Exchange Rate": "Tipo de Cambio Peso / USD",
    "Peso/USD Devaluation (2012–2018)": "Devaluación Peso/USD (2012–2018)",
    "Philippines Annual Reef Ecosystem Loss": "Pérdida Anual de Ecosistema de Arrecifes de Filipinas",
    "Philippines Protests vs. China (Marcos Era)": "Protestas de Filipinas contra China (Era Marcos)",
    "Poison Gas Casualties": "Bajas por Gas Venenoso",
    "Poland Defense Spending (% GDP)": "Gasto de Defensa de Polonia (% PIB)",
    "Political Prisoners": "Presos Políticos",
    "Political Prisoners (post-July 2021)": "Presos Políticos (post-julio 2021)",
    "Population at IPC Phase 5 (Catastrophe) Risk": "Población en Riesgo de Fase 5 de la CIF (Catástrofe)",
    "Poverty Rate (2006 vs 2000)": "Tasa de Pobreza (2006 vs 2000)",
    "Poverty Rate (2024)": "Tasa de Pobreza (2024)",
    "Poverty Rate Change": "Cambio en la Tasa de Pobreza",
    "Presidential Approval Rating": "Aprobación Presidencial",
    "Prison Escapees — Aguaruto (2019)": "Fugados de Prisión — Aguaruto (2019)",
    "Prisoners of War": "Prisioneros de Guerra",
    "Proposed FY2026 NASA Budget Cut": "Recorte Propuesto al Presupuesto de NASA AF2026",

    # --- Q ---
    "Quantum Supremacy Claimed": "Supremacía Cuántica Reclamada",

    # --- R ---
    "Refugees in Neighbors": "Refugiados en Países Vecinos",
    "Registered Disappearances (Sexenio)": "Desapariciones Registradas (Sexenio)",
    "Registered National Parties (2024)": "Partidos Nacionales Registrados (2024)",
    "Registered Palestinian Refugees": "Refugiados Palestinos Registrados",
    "Registered Voters (2024)": "Votantes Registrados (2024)",
    "Remains Identified via DNA": "Restos Identificados por ADN",
    "Remittances (% of GDP)": "Remesas (% del PIB)",
    "Remittances (2024 Record)": "Remesas (Récord 2024)",
    "Remittances Received (2006)": "Remesas Recibidas (2006)",
    "Roadblocks in Culiacán (Oct 2019)": "Bloqueos en Culiacán (Oct 2019)",
    "Rockets Fired (Oct 7 Barrage)": "Cohetes Disparados (Barrage del 7 Oct)",
    "Rural Communities Abandoned": "Comunidades Rurales Abandonadas",
    "Russian Military Casualties": "Bajas Militares Rusas",

    # --- S ---
    "SAC Territory Control": "Control Territorial del SAC",
    "SCS Proved/Probable Oil Reserves": "Reservas Probadas/Probables de Petróleo del Mar de China Meridional",
    "SLS Block 1 Thrust at Liftoff": "Empuje del SLS Block 1 al Despegue",
    "SLS Cost Per Launch": "Costo por Lanzamiento del SLS",
    "SMIC Revenue (2024)": "Ingresos de SMIC (2024)",
    "SNA Estimated Strength": "Fuerza Estimada del SNA",
    "SOA/WHINSEC Graduates (1946–2024)": "Graduados de la SOA/WHINSEC (1946–2024)",
    "SW Border Encounters (2025)": "Encuentros en la Frontera Sur (2025)",
    "Sahel Fatalities (2024)": "Muertes en el Sahel (2024)",
    "Schools Closed — Burkina Faso": "Escuelas Cerradas — Burkina Faso",
    "Seguro Popular Enrollees (2006)": "Afiliados al Seguro Popular (2006)",
    "Seized Weapons from U.S. Origin (2023)": "Armas Decomisadas de Origen Estadounidense (2023)",
    "Sexual Violence Cases (Reported)": "Casos de Violencia Sexual (Reportados)",
    "Siachen Glacier — Highest Battlefield": "Glaciar de Siachen — Campo de Batalla Más Alto",
    "Silver Mined at Potosí (1545–1800)": "Plata Extraída en Potosí (1545–1800)",
    "Soldiers Deployed (Jan 2023)": "Soldados Desplegados (Ene 2023)",
    "Soviet Total Deaths (est.)": "Total de Muertes Soviéticas (est.)",
    "SpaceX HLS Contract Value": "Valor del Contrato HLS de SpaceX",
    "SpaceX Valuation (Private)": "Valuación de SpaceX (Privada)",
    "Spanish Colonial Territory at Peak (c.1820)": "Territorio Colonial Español en su Pico (c.1820)",
    "Spotify Global #1 Artist Years": "Años como Artista #1 Global en Spotify",
    "Starlink Subscribers": "Suscriptores de Starlink",
    "Starship Integrated Flight Tests": "Pruebas de Vuelo Integrado de Starship",
    "Structural Reforms Passed": "Reformas Estructurales Aprobadas",
    "Structures Destroyed/Damaged in Gaza": "Estructuras Destruidas/Dañadas en Gaza",
    "Student Strike Duration (1968)": "Duración de la Huelga Estudiantil (1968)",
    "Students Still Missing": "Estudiantes Aún Desaparecidos",
    "Successful Booster Landings": "Aterrizajes Exitosos de Propulsor",
    "Successful Prosecutions": "Procesos Judiciales Exitosos",
    "Super Bowl LX Halftime Viewers (US)": "Espectadores del Medio Tiempo del Super Bowl LX (EE.UU.)",
    "Suspects Arrested (Total)": "Sospechosos Detenidos (Total)",

    # --- T ---
    "TSMC Global Foundry Share": "Participación Global de Fundición de TSMC",
    "TTP Attacks in Pakistan (2023)": "Ataques del TTP en Pakistán (2023)",
    "TV Rights Revenue": "Ingresos por Derechos de TV",
    "Taiwan Defense Budget 2026": "Presupuesto de Defensa de Taiwán 2026",
    "Tanker Flights Needed for Starship HLS": "Vuelos de Cisterna Necesarios para Starship HLS",
    "Tariff Rate on China (2025–2026)": "Tasa Arancelaria sobre China (2025–2026)",
    "Teams Competing": "Equipos Competidores",
    "Territory Ceded by Mexico": "Territorio Cedido por México",
    "Thyroid Cancer Cases (Fukushima Cohort)": "Casos de Cáncer de Tiroides (Cohorte Fukushima)",
    "Ticket Applications Received": "Solicitudes de Boletos Recibidas",
    "Top Cartel Leaders Neutralized": "Líderes de Cárteles Neutralizados",
    "Total Artemis Investment": "Inversión Total en Artemis",
    "Total Casualties (incl. wounded)": "Bajas Totales (incl. heridos)",
    "Total Deaths (est.)": "Total de Muertes (est.)",
    "Total Homicides (2025)": "Total de Homicidios (2025)",
    "Total Homicides (6-Year Term)": "Total de Homicidios (Sexenio)",
    "Total Killed": "Total de Muertos",
    "Total Matches": "Total de Partidos",
    "Total Orbital Launches": "Total de Lanzamientos Orbitales",
    "Total Prize Money": "Premio Total en Efectivo",
    "Total US Security Aid to Colombia (Plan Colombia, 2000–2016)": "Ayuda Total de Seguridad de EE.UU. a Colombia (Plan Colombia, 2000–2016)",
    "Total US War Expenditure": "Gasto Total de Guerra de EE.UU.",
    "Total War Cost (1918 USD)": "Costo Total de la Guerra (USD 1918)",
    "Total Western Aid to Ukraine": "Ayuda Occidental Total a Ucrania",
    "Tournament Duration": "Duración del Torneo",
    "Townships Under Resistance Control": "Municipios Bajo Control de la Resistencia",
    "Trafficking Routes Lost": "Rutas de Tráfico Perdidas",
    "Tren Maya Final Cost": "Costo Final del Tren Maya",
    "Trump Approval Rating (Mar 2026)": "Aprobación de Trump (Mar 2026)",

    # --- U ---
    "U-Boats Sunk": "Submarinos Hundidos",
    "U.S. Bounty on El Mencho": "Recompensa de EE.UU. por El Mencho",
    "U.S. COVID-19 Deaths": "Muertes por COVID-19 en EE.UU.",
    "U.S. Service Members Killed in Afghanistan": "Militares de EE.UU. Muertos en Afganistán",
    "UN General Assembly Speeches": "Discursos ante la Asamblea General de la ONU",
    "UNSC Resolutions on Palestine": "Resoluciones del CSNU sobre Palestina",
    "US 10Y Treasury Yield": "Rendimiento del Tesoro de EE.UU. a 10 Años",
    "US Arms Sales to Taiwan (Cumulative)": "Ventas de Armas de EE.UU. a Taiwán (Acumuladas)",
    "US Avg Effective Tariff Rate": "Tasa Arancelaria Efectiva Promedio de EE.UU.",
    "US CHIPS Act Manufacturing Grants Awarded": "Subsidios de Manufactura del CHIPS Act de EE.UU. Otorgados",
    "US Consumer Confidence": "Confianza del Consumidor de EE.UU.",
    "US Core PCE Inflation": "Inflación PCE Subyacente de EE.UU.",
    "US Covert Funding to Destabilize Allende": "Financiamiento Encubierto de EE.UU. para Desestabilizar a Allende",
    "US Deaths from Disease": "Muertes de EE.UU. por Enfermedad",
    "US Direct GDP Contribution": "Contribución Directa al PIB de EE.UU.",
    "US Fentanyl OD Deaths (2024)": "Muertes por Sobredosis de Fentanilo en EE.UU. (2024)",
    "US Fentanyl Seizures Decline": "Disminución de Decomisos de Fentanilo en EE.UU.",
    "US GDP Q4 2025": "PIB de EE.UU. T4 2025",
    "US Indemnity to Mexico": "Indemnización de EE.UU. a México",
    "US Intel 2027 Invasion Assessment": "Evaluación de Inteligencia de EE.UU. sobre Invasión 2027",
    "US Jobs Created (FTE)": "Empleos Creados en EE.UU. (ETC)",
    "US Killed": "Estadounidenses Muertos",
    "US Killed in Action": "Estadounidenses Muertos en Acción",
    "US Military Deaths": "Muertes Militares de EE.UU.",
    "US National Debt": "Deuda Nacional de EE.UU.",
    "US Reconstruction Aid Spent": "Ayuda de Reconstrucción de EE.UU. Gastada",
    "US Share of NATO Defense Spending": "Participación de EE.UU. en el Gasto de Defensa de la OTAN",
    "US Troops Deployed": "Tropas de EE.UU. Desplegadas",
    "US Troops Deployed in Europe": "Tropas de EE.UU. Desplegadas en Europa",
    "US Troops Killed": "Tropas de EE.UU. Muertos",
    "US Unemployment Rate": "Tasa de Desempleo de EE.UU.",
    "US Unemployment Rate (early 2026)": "Tasa de Desempleo de EE.UU. (inicios 2026)",
    "Ukrainian Military Casualties": "Bajas Militares Ucranianas",
    "Ukrainian Territory Under Russian Control": "Territorio Ucraniano Bajo Control Ruso",
    "Un Verano Sin Ti Spotify Streams": "Reproducciones de Un Verano Sin Ti en Spotify",
    "Unemployment Rate": "Tasa de Desempleo",

    # --- V ---
    "VIX (Market Fear Index)": "VIX (Índice de Miedo del Mercado)",
    "Vaccine Doses Administered Globally": "Dosis de Vacunas Administradas Globalmente",
    "Venezuelans Displaced (2015–2024)": "Venezolanos Desplazados (2015–2024)",
    "Verified Civilian Deaths (UN)": "Muertes Civiles Verificadas (ONU)",
    "Victim Compensation Fund Total Paid": "Total Pagado del Fondo de Compensación a Víctimas",
    "Victims Under Pinochet Dictatorship (1973–1990)": "Víctimas Bajo la Dictadura de Pinochet (1973–1990)",

    # --- W ---
    "WHO Variants of Concern Designated": "Variantes de Preocupación Designadas por la OMS",
    "WTC Health Program Enrollment": "Inscripción en el Programa de Salud del WTC",
    "Wagner/Africa Corps in Mali": "Wagner/Africa Corps en Mali",
    "War Duration": "Duración de la Guerra",
    "War Duration (Mexican-American)": "Duración de la Guerra (México-EE.UU.)",
    "West Bank Palestinians Killed (Since Oct 7 2023)": "Palestinos Muertos en Cisjordania (Desde Oct 7, 2023)",
    "Western Front Length": "Longitud del Frente Occidental",
    "Women in Congress (2024)": "Mujeres en el Congreso (2024)",

    # --- Y ---
    "Years Ovidio Remained Free After 2019": "Años que Ovidio Permaneció Libre Después de 2019",
    "Years Since Disappearance": "Años Desde la Desaparición",
    "Years Since Explosion": "Años Desde la Explosión",
    "Years of Active Insurgency": "Años de Insurgencia Activa",
    "Years of Conflict": "Años de Conflicto",
    "Years of PRI Rule": "Años de Gobierno del PRI",
    "Years of PRI Rule Ended": "Años de Gobierno del PRI Terminados",
    "Years of Quantum Theory": "Años de Teoría Cuántica",
    "Years of US Embargo": "Años de Embargo de EE.UU.",
    "Years of US Trade Embargo Against Cuba": "Años de Embargo Comercial de EE.UU. contra Cuba",
}


# ---------------------------------------------------------------------------
# META TRANSLATIONS — per-tracker
# Each tracker maps translatable fields. Keys not present are copied as-is.
# ---------------------------------------------------------------------------
META_TRANSLATIONS: dict[str, dict[str, str]] = {
    "afghanistan-pakistan-war": {
        "operationName": "Guerra Af-Pak",
        "heroHeadline": "Rusia Reconoce a los Talibán; Cese al Fuego Pakistán-Afganistán 'Tormenta del Khyber' Se Mantiene mientras Persiste la Amenaza de ISIS-K",
        "heroSubtitle": "Del 11-S a la toma talibán y al conflicto interestatal: seguimiento de más de 8,900 días de la guerra más larga de Estados Unidos, el gobierno talibán y la crisis humanitaria en Afganistán, junto con la insurgencia del TTP en Pakistán.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos recopilados de fuentes OSINT, informes de UNAMA, Long War Journal, ACLED, Resolute Support y más. Todas las cifras disputadas están marcadas.",
    },
    "amlo-presidency": {
        "operationName": "4T / AMLO",
        "heroHeadline": "La Cuarta Transformación de AMLO: Reducción Récord de Pobreza, Violencia Récord y Revolución Judicial",
        "heroSubtitle": "Seis años de la 4T: 13.4 millones sacados de la pobreza, más de 166,000 homicidios, Tren Maya de $28 mil millones de USD, y el poder judicial de México transformado por una elección popular de jueces.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de INEGI, Coneval, Banxico, SHCP, Amnistía Internacional y medios mexicanos. Todas las cifras disputadas están marcadas.",
    },
    "artemis-2": {
        "operationName": "Artemis",
        "heroHeadline": "Artemis: El Regreso de Estados Unidos a la Luna Enfrenta Retrasos y Disputas Presupuestarias",
        "heroSubtitle": "Seguimiento de SLS, Orion, Starship HLS, Gateway lunar y el camino a Marte — desde la SPD-1 en 2017 hasta la revisión de arquitectura de febrero de 2026.",
        "dateline": "CENTRO ESPACIAL KENNEDY — MARZO 2026 — INFORME DE ESTADO",
        "footerNote": "Datos compilados de NASA, GAO, SpaceX, informes del Inspector General, y medios aeroespaciales. Todas las cifras disputadas están marcadas.",
    },
    "ayotzinapa": {
        "operationName": "Caso Ayotzinapa — 43 Estudiantes Desaparecidos",
        "heroHeadline": "43 Estudiantes Siguen Desaparecidos Después de 11 Años",
        "heroSubtitle": "El 26 de septiembre de 2014, 43 estudiantes de la Escuela Normal Rural de Ayotzinapa fueron desaparecidos forzadamente en Iguala, Guerrero. La 'verdad histórica' fue desmentida, una Comisión de la Verdad lo declaró crimen de Estado, pero la justicia plena sigue fuera de alcance. Solo 3 de 43 han sido identificados.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — ESTADO DE LA INVESTIGACIÓN",
        "footerNote": "Datos compilados de informes del GIEI (I–VI), Comisión de la Verdad de México, informes forenses del EAAF, declaraciones de la CIDH/OACNUDH, y periodismo de investigación (Proceso, Animal Político, La Jornada). Todas las cifras disputadas están marcadas.",
    },
    "bad-bunny": {
        "operationName": "Bad Bunny",
        "heroHeadline": "Bad Bunny: El Artista Más Grande del Mundo Rompe Récords de Giras en 2025",
        "heroSubtitle": "Seguimiento de la trayectoria del artista más reproducido en Spotify de todos los tiempos — desde SoundCloud hasta estadios, dominación del Super Bowl, y activismo cultural.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de Spotify, Billboard, Pollstar, RIAA, y medios de la industria musical. Todas las cifras están actualizadas a la fecha indicada.",
    },
    "bts": {
        "operationName": "BTS",
        "heroHeadline": "BTS: Fenómeno Musical Global, Reunión del Grupo Se Acerca tras el Servicio Militar",
        "heroSubtitle": "Seguimiento de la trayectoria de los artistas surcoreanos más exitosos de la historia — desde su debut en 2013 hasta la dominación global, el servicio militar y la reunión anticipada en 2025.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de Billboard, IFPI, Hanteo Chart, HYBE, y medios de la industria musical. Todas las cifras están actualizadas a la fecha indicada.",
    },
    "calderon-presidency": {
        "operationName": "Sexenio Calderón",
        "heroHeadline": "Felipe Calderón: La Guerra contra el Narco que Transformó a México",
        "heroSubtitle": "Seguimiento de los seis años del gobierno de Felipe Calderón (2006–2012): la militarización de la seguridad pública, más de 120,000 muertos en la guerra contra el narcotráfico, reformas estructurales y la herencia que definió la política de seguridad mexicana.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de INEGI, SNSP, Amnistía Internacional, Human Rights Watch, y medios mexicanos. Todas las cifras disputadas están marcadas.",
    },
    "chernobyl-disaster": {
        "operationName": "Desastre de Chernóbil",
        "heroHeadline": "Chernóbil: A Casi 40 Años de la Peor Catástrofe Nuclear de la Historia",
        "heroSubtitle": "Seguimiento del legado del desastre del reactor No. 4 de Chernóbil del 26 de abril de 1986: desde la explosión y el heroísmo de los liquidadores hasta el Nuevo Confinamiento Seguro y la continua zona de exclusión.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de OIEA, OMS, UNSCEAR, y reportes del gobierno ucraniano. Todas las cifras disputadas están marcadas.",
    },
    "chile-allende-pinochet": {
        "operationName": "Chile: Allende y Pinochet",
        "heroHeadline": "Chile: Del Socialismo Democrático al Golpe Militar y la Dictadura",
        "heroSubtitle": "Seguimiento de la era de Allende, el golpe del 11 de septiembre de 1973, 17 años de dictadura de Pinochet, y la larga búsqueda de justicia que continúa hasta hoy.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la Comisión Rettig, Comisión Valech, documentos desclasificados de la CIA, y reportes de organizaciones de derechos humanos. Todas las cifras disputadas están marcadas.",
    },
    "china-tech-revolution": {
        "operationName": "Revolución Tecnológica de China",
        "heroHeadline": "China: Superpotencia Tecnológica en Ascenso Desafía el Dominio de EE.UU.",
        "heroSubtitle": "Seguimiento de la carrera tecnológica entre China y Estados Unidos: IA, semiconductores, vehículos eléctricos, 5G, computación cuántica y la batalla por la supremacía tecnológica global.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de reportes del gobierno chino, SEMI, Gartner, IDC, y medios tecnológicos especializados. Todas las cifras disputadas están marcadas.",
    },
    "covid-pandemic": {
        "operationName": "Pandemia de COVID-19",
        "heroHeadline": "COVID-19: La Pandemia que Cambió el Mundo",
        "heroSubtitle": "Seguimiento de la pandemia global desde el brote en Wuhan hasta la vacunación masiva, variantes, y el impacto económico y social que redefinió la vida moderna.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la OMS, Johns Hopkins CSSE, Our World in Data, CDC, y ministerios de salud nacionales. Todas las cifras disputadas están marcadas.",
    },
    "cuba-crises": {
        "operationName": "Crisis de Cuba",
        "heroHeadline": "Cuba: De la Revolución al Embargo y la Crisis Perpetua",
        "heroSubtitle": "Seguimiento de más de seis décadas de revolución, embargo económico de EE.UU., Crisis de los Misiles, éxodo del Mariel, Período Especial y la lucha continua del pueblo cubano.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de archivos de la ONU, reportes del Departamento de Estado de EE.UU., fuentes cubanas independientes, y organizaciones de derechos humanos. Todas las cifras disputadas están marcadas.",
    },
    "culiacanazo": {
        "operationName": "Culiacanazo",
        "heroHeadline": "Culiacanazo: La Guerra Civil del Cártel de Sinaloa Desgarra a una Ciudad",
        "heroSubtitle": "Seguimiento de los eventos del Culiacanazo de octubre 2019, la Operación Ovidio de enero 2023, y la guerra civil del Cártel de Sinaloa que estalló en septiembre 2024 tras la captura de 'El Mayo' Zambada.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de SNSP, medios locales de Sinaloa, reportes de inteligencia de EE.UU., y organizaciones de derechos humanos. Todas las cifras disputadas están marcadas.",
    },
    "european-conquest-americas": {
        "operationName": "Conquista Europea de las Américas",
        "heroHeadline": "La Conquista: Cómo Europa Destruyó Civilizaciones Enteras en las Américas",
        "heroSubtitle": "Seguimiento de la conquista europea desde 1492: el colapso demográfico indígena, la extracción de recursos, el sistema de encomiendas, la esclavitud transatlántica y la transformación permanente de las Américas.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de fuentes académicas, archivos coloniales, y estudios demográficos. Todas las cifras estimadas están marcadas. Las estimaciones de población precolombina varían ampliamente entre investigadores.",
    },
    "fox-presidency": {
        "operationName": "Sexenio Fox",
        "heroHeadline": "Vicente Fox: El Primer Presidente de la Alternancia Democrática en México",
        "heroSubtitle": "Seguimiento del sexenio de Vicente Fox (2000–2006): el fin de 71 años de gobierno del PRI, promesas de cambio, y el legado de la primera transición democrática de México.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de INEGI, Banxico, y medios mexicanos. Todas las cifras disputadas están marcadas.",
    },
    "fukushima-disaster": {
        "operationName": "Desastre de Fukushima",
        "heroHeadline": "Fukushima: 15 Años Después del Peor Desastre Nuclear Desde Chernóbil",
        "heroSubtitle": "Seguimiento de la catástrofe del 11 de marzo de 2011 en la planta nuclear de Fukushima Daiichi: el tsunami, la triple fusión de núcleos, la evacuación masiva, y el desmantelamiento que durará décadas.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de TEPCO, OIEA, gobierno de Japón, OMS, y reportes de la prefectura de Fukushima. Todas las cifras disputadas están marcadas.",
    },
    "gaza-war": {
        "operationName": "Guerra de Gaza",
        "heroHeadline": "Gaza: La Guerra Más Letal en la Historia del Conflicto Palestino-Israelí",
        "heroSubtitle": "Seguimiento de la guerra en Gaza desde el ataque de Hamas del 7 de octubre de 2023: la ofensiva israelí, la crisis humanitaria catastrófica, y las negociaciones de alto al fuego.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados del Ministerio de Salud de Gaza, FDI, OCHA, UNRWA, y medios internacionales. Todas las cifras disputadas están marcadas. Verificación multi-fuente activa.",
    },
    "global-recession-risk": {
        "operationName": "Riesgo de Recesión Global",
        "heroHeadline": "Economía Global: Riesgo de Recesión Se Intensifica ante Guerra Comercial y Conflictos",
        "heroSubtitle": "Seguimiento de los indicadores económicos globales: aranceles de EE.UU., tensiones comerciales, inflación, tasas de interés y señales de recesión en las principales economías del mundo.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados del FMI, Banco Mundial, Fed, BCE, Bloomberg, y Reuters. Todas las cifras disputadas están marcadas.",
    },
    "haiti-collapse": {
        "operationName": "Colapso de Haití",
        "heroHeadline": "Haití: Un Estado en Colapso Total Bajo el Control de las Pandillas",
        "heroSubtitle": "Seguimiento del colapso institucional de Haití: pandillas controlando la capital, crisis humanitaria extrema, vacío de poder político, y la misión multinacional de seguridad.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de OCHA, BINUH, reportes de la PNH, y organizaciones de derechos humanos. Todas las cifras disputadas están marcadas.",
    },
    "ice-history": {
        "operationName": "ICE: Historia y Operaciones",
        "heroHeadline": "ICE: De la Creación Post-11S a la Mayor Operación de Detención del Mundo",
        "heroSubtitle": "Seguimiento de la historia del Servicio de Inmigración y Control de Aduanas (ICE): desde su creación en 2003 hasta la expansión masiva de detención, deportaciones y las políticas migratorias de cada administración.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de DHS, ICE ERO, TRAC Immigration, ACLU, y reportes del Inspector General. Todas las cifras disputadas están marcadas.",
    },
    "india-pakistan-conflict": {
        "operationName": "Conflicto India-Pakistán",
        "heroHeadline": "India vs Pakistán: Dos Potencias Nucleares en el Borde del Conflicto",
        "heroSubtitle": "Seguimiento de más de 75 años de conflicto entre India y Pakistán: desde la partición de 1947, cuatro guerras, la disputa por Cachemira, y la escalada nuclear que amenaza la estabilidad global.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de ministerios de defensa de India y Pakistán, UNMOGIP, SIPRI, y medios regionales. Todas las cifras disputadas están marcadas.",
    },
    "iran-conflict": {
        "operationName": "Operación Furia Épica / León Rugiente",
        "heroHeadline": "Khamenei Proclama 'Golpe Devastador' mientras Trump Rechaza Alto al Fuego;<br>67.ª Oleada de Irán Ataca Israel; Suiza Rompe con EE.UU. en Armas y Espacio Aéreo;<br>Qatar LNG Fuera de Línea Día 2; Brent ~$112; 7,200+ Objetivos Alcanzados",
        "heroSubtitle": "Día 22 — El nuevo Líder Supremo de Irán, Mojtaba Khamenei, emitió una declaración afirmando que Irán había propinado un 'golpe devastador' al enemigo, lo que provocó que Trump rechazara de plano las conversaciones de alto al fuego: 'No habrá alto al fuego mientras Irán se niegue a rendirse.' Irán lanzó su 67.ª oleada de represalia, atacando ciudades israelíes y bases estadounidenses en el Golfo con ~42 proyectiles; 6 civiles heridos cerca de Rishon LeZion — sin víctimas mortales israelíes. En una ruptura diplomática dramática, Suiza suspendió las autorizaciones de exportación de armas a EE.UU. y cerró su espacio aéreo a vuelos militares estadounidenses vinculados a la campaña contra Irán, citando neutralidad permanente. Trump llamó públicamente a los aliados de la OTAN 'cobardes' por no desplegar buques en Ormuz. La producción de GNL de Qatar permaneció fuera de línea por segundo día consecutivo, desencadenando un aumento del 18% en los precios spot de GNL en Asia, un salto del 22% en los futuros de gas TTF europeo, y una alerta de emergencia de precios alimentarios de la FAO de la ONU. El crudo Brent cerró cerca de $112/barril. Los ataques de EE.UU.-Israel elevaron el conteo acumulado de objetivos a más de 7,200, con las FDI afirmando haber destruido el 73% de los lanzadores móviles de Irán y el 87% de su radar/defensa aérea. Las protestas contra la guerra en Teherán, Isfahan y Tabriz fueron reprimidas por las fuerzas Basij — al menos 14 arrestos durante Nowruz. Dentro de Irán, reportes describen creciente presión civil para terminar la guerra a pesar del apagón de internet que supera las 310 horas.",
        "dateline": "DÍA 22 — 21 DE MARZO DE 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de más de 100 fuentes de 4 polos mediáticos al 21 de marzo de 2026. Todas las afirmaciones disputadas están marcadas. Verificación multi-fuente activa.",
    },
    "israel-palestine": {
        "operationName": "Conflicto Israel-Palestina",
        "heroHeadline": "Israel-Palestina: Un Conflicto de Más de 75 Años Sin Resolución",
        "heroSubtitle": "Seguimiento del conflicto desde la fundación de Israel en 1948: guerras, ocupación, asentamientos, intifadas, y la búsqueda interminable de una solución de dos estados.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de OCHA, B'Tselem, FDI, PCBS, y medios internacionales. Todas las cifras disputadas están marcadas.",
    },
    "mencho-cjng": {
        "operationName": "El Mencho y el CJNG",
        "heroHeadline": "El Mencho Abatido: El Fin del Líder Más Buscado del Narcotráfico",
        "heroSubtitle": "Seguimiento de la trayectoria de Nemesio Oseguera 'El Mencho' y el Cártel Jalisco Nueva Generación: desde su ascenso meteórico hasta su muerte y la fragmentación del cártel más violento de México.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de DEA, DOJ, SNSP, y medios especializados en seguridad. Todas las cifras disputadas están marcadas.",
    },
    "mexico-us-conflict": {
        "operationName": "Conflicto México-EE.UU.",
        "heroHeadline": "México vs EE.UU.: De la Anexión de Texas a la Guerra de los Aranceles",
        "heroSubtitle": "Seguimiento de la relación conflictiva entre México y Estados Unidos: desde la guerra de 1846–48, la pérdida de la mitad del territorio, hasta las tensiones comerciales y migratorias del siglo XXI.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de fuentes históricas, Archivo General de la Nación, y estudios académicos. Todas las cifras estimadas están marcadas.",
    },
    "mh17-shootdown": {
        "operationName": "Derribo del MH17",
        "heroHeadline": "MH17: Justicia Incompleta 12 Años Después del Derribo",
        "heroSubtitle": "Seguimiento del derribo del vuelo 17 de Malaysia Airlines el 17 de julio de 2014 sobre el este de Ucrania: la investigación del JIT, el juicio en La Haya, y la búsqueda de justicia para las 298 víctimas.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados del JIT, Dutch Safety Board, tribunal de La Haya, Bellingcat, y fuentes gubernamentales. Todas las cifras disputadas están marcadas.",
    },
    "mx-political-history": {
        "operationName": "Historia Política de México",
        "heroHeadline": "México: Siglo de Transformaciones Políticas — Del PRI Hegemónico a la 4T",
        "heroSubtitle": "Seguimiento de la evolución política de México: desde la Revolución y la hegemonía del PRI, pasando por la alternancia democrática, hasta la Cuarta Transformación y el gobierno de Claudia Sheinbaum.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de INE, fuentes históricas, y análisis político. Todas las cifras disputadas están marcadas.",
    },
    "myanmar-civil-war": {
        "operationName": "Guerra Civil de Myanmar",
        "heroHeadline": "Myanmar: La Junta Militar Pierde Terreno ante la Resistencia Armada",
        "heroSubtitle": "Seguimiento de la guerra civil desde el golpe militar del 1 de febrero de 2021: la resistencia armada, las atrocidades de la junta, y la crisis humanitaria que desplaza a millones.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de AAPP, ISP Myanmar, OCHA, y medios independientes. Todas las cifras disputadas están marcadas.",
    },
    "nato-us-tensions": {
        "operationName": "Tensiones OTAN-EE.UU.",
        "heroHeadline": "OTAN en Crisis: La Alianza Se Resquebraja ante las Presiones de Trump",
        "heroSubtitle": "Seguimiento de las tensiones entre EE.UU. y la OTAN: disputas sobre gasto de defensa, la guerra en Ucrania, el rearme europeo, y el futuro de la alianza transatlántica.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la OTAN, SIPRI, IISS, y medios internacionales. Todas las cifras disputadas están marcadas.",
    },
    "october-7-attack": {
        "operationName": "Ataque del 7 de Octubre",
        "heroHeadline": "7 de Octubre: El Peor Ataque contra Israel en su Historia",
        "heroSubtitle": "Seguimiento del ataque sorpresa de Hamas del 7 de octubre de 2023: la infiltración masiva, la toma de rehenes, la respuesta israelí y las consecuencias que redefinieron el conflicto.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de FDI, policía de Israel, Hamas, medios israelíes y palestinos. Todas las cifras disputadas están marcadas.",
    },
    "pena-nieto-presidency": {
        "operationName": "Sexenio Peña Nieto",
        "heroHeadline": "Peña Nieto: Reformas Estructurales Empañadas por Corrupción y Ayotzinapa",
        "heroSubtitle": "Seguimiento del sexenio de Enrique Peña Nieto (2012–2018): el Pacto por México, reformas estructurales, la desaparición de los 43 de Ayotzinapa, y los escándalos de corrupción.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de INEGI, SHCP, Coneval, y medios mexicanos. Todas las cifras disputadas están marcadas.",
    },
    "quantum-theory": {
        "operationName": "Teoría Cuántica",
        "heroHeadline": "Física Cuántica: De la Revolución Teórica a la Carrera por la Computación Cuántica",
        "heroSubtitle": "Seguimiento de más de 125 años de mecánica cuántica: desde Planck y Einstein hasta las computadoras cuánticas de Google, IBM y China, y la carrera por la supremacía cuántica.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de publicaciones científicas, Nobel Foundation, y reportes de la industria cuántica. Todas las cifras están actualizadas a la fecha indicada.",
    },
    "sahel-insurgency": {
        "operationName": "Insurgencia del Sahel",
        "heroHeadline": "Sahel: La Insurgencia Yihadista Se Expande mientras los Golpes Militares Redefinen la Región",
        "heroSubtitle": "Seguimiento de la crisis de seguridad en el Sahel: el avance del JNIM y Estado Islámico, golpes militares en Mali, Burkina Faso y Níger, la salida de Francia, y la entrada de Wagner/Africa Corps.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de ACLED, OCHA, MINUSMA, y medios regionales. Todas las cifras disputadas están marcadas.",
    },
    "september-11": {
        "operationName": "11 de Septiembre",
        "heroHeadline": "11-S: A Casi 25 Años del Día que Cambió el Mundo",
        "heroSubtitle": "Seguimiento del legado de los ataques del 11 de septiembre de 2001: desde la caída de las Torres Gemelas hasta la Guerra contra el Terror, el Fondo de Compensación a Víctimas, y las enfermedades de los primeros respondientes.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la Comisión del 11-S, NIST, VCF, WTC Health Program, y medios estadounidenses. Todas las cifras disputadas están marcadas.",
    },
    "sheinbaum-presidency": {
        "operationName": "Sexenio Sheinbaum",
        "heroHeadline": "Claudia Sheinbaum: La Primera Presidenta de México Enfrenta Guerra Comercial y Violencia",
        "heroSubtitle": "Seguimiento del gobierno de Claudia Sheinbaum desde octubre de 2024: continuidad de la 4T, aranceles de Trump, reforma judicial, y los desafíos de seguridad y economía.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de gobierno federal, INEGI, Banxico, y medios mexicanos. Todas las cifras disputadas están marcadas.",
    },
    "sinaloa-fragmentation": {
        "operationName": "Fragmentación de Sinaloa",
        "heroHeadline": "Cártel de Sinaloa: La Guerra Interna que Fragmentó al Cártel Más Poderoso",
        "heroSubtitle": "Seguimiento de la fragmentación del Cártel de Sinaloa tras la captura de 'El Mayo' Zambada y la extradición de los hijos de 'El Chapo': guerra civil, territorios en disputa, y la reestructuración del narcotráfico mexicano.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de DEA, DOJ, SNSP, y medios especializados en seguridad. Todas las cifras disputadas están marcadas.",
    },
    "somalia-conflict": {
        "operationName": "Conflicto de Somalia",
        "heroHeadline": "Somalia: Tres Décadas de Conflicto Sin Estado Funcional",
        "heroSubtitle": "Seguimiento del conflicto en Somalia: desde el colapso del gobierno en 1991, la insurgencia de Al-Shabaab, las intervenciones internacionales, y la crisis humanitaria permanente.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de AMISOM/ATMIS, OCHA, ACLED, y medios regionales. Todas las cifras disputadas están marcadas.",
    },
    "southeast-asia-escalation": {
        "operationName": "Escalada en el Sudeste Asiático",
        "heroHeadline": "Mar de China Meridional: La Tensión Militar Escala entre China, Filipinas y Taiwán",
        "heroSubtitle": "Seguimiento de la escalada en el Sudeste Asiático: las incursiones de China, la resistencia de Filipinas, las amenazas sobre Taiwán, y la respuesta militar de EE.UU. en la región Indo-Pacífico.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de CSIS AMTI, ministerios de defensa regionales, y medios del Indo-Pacífico. Todas las cifras disputadas están marcadas.",
    },
    "spacex-history": {
        "operationName": "Historia de SpaceX",
        "heroHeadline": "SpaceX: De los Fracasos en Kwajalein a la Dominación del Espacio Comercial",
        "heroSubtitle": "Seguimiento de la trayectoria de SpaceX: desde los primeros lanzamientos fallidos de Falcon 1, la revolución de los cohetes reutilizables, Starlink, y el desarrollo de Starship.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de SpaceX, NASA, FAA, y medios aeroespaciales especializados. Todas las cifras están actualizadas a la fecha indicada.",
    },
    "sudan-conflict": {
        "operationName": "Conflicto de Sudán",
        "heroHeadline": "Sudán: La Peor Crisis Humanitaria del Mundo Se Profundiza",
        "heroSubtitle": "Seguimiento de la guerra civil en Sudán desde abril de 2023: el conflicto entre las SAF y las RSF, millones de desplazados, hambruna, y una catástrofe humanitaria sin precedentes.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de OCHA, ACLED, Sudan War Monitor, y organizaciones humanitarias. Todas las cifras disputadas están marcadas.",
    },
    "taiwan-conflict": {
        "operationName": "Conflicto de Taiwán",
        "heroHeadline": "Taiwán: La Crisis del Estrecho Se Intensifica con Ejercicios Militares de China",
        "heroSubtitle": "Seguimiento de la crisis en el Estrecho de Taiwán: las amenazas de reunificación de China, los ejercicios militares, las ventas de armas de EE.UU. a Taiwán, y la industria de semiconductores como factor estratégico.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados del Ministerio de Defensa de Taiwán, PLA Daily, CSIS, y medios internacionales. Todas las cifras disputadas están marcadas.",
    },
    "tlatelolco-1968": {
        "operationName": "Masacre de Tlatelolco 1968",
        "heroHeadline": "Tlatelolco: La Masacre Estudiantil que Marcó a México",
        "heroSubtitle": "Seguimiento de los eventos del 2 de octubre de 1968 en la Plaza de las Tres Culturas: la masacre de estudiantes, la represión del movimiento estudiantil, y la búsqueda de verdad y justicia que continúa.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la CNDH, documentos desclasificados del Archivo General de la Nación, NSA Archive, y testimonios publicados. Todas las cifras disputadas están marcadas.",
    },
    "trump-presidencies": {
        "operationName": "Presidencias de Trump",
        "heroHeadline": "Trump: Dos Mandatos que Redefinen la Política Estadounidense y el Orden Global",
        "heroSubtitle": "Seguimiento de las presidencias de Donald Trump: desde el primer mandato (2017–2021), la insurrección del 6 de enero, hasta el segundo mandato con aranceles masivos, DOGE, y una política exterior disruptiva.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de la Casa Blanca, CBO, Fed, y medios estadounidenses. Todas las cifras disputadas están marcadas.",
    },
    "ukraine-war": {
        "operationName": "Guerra de Ucrania",
        "heroHeadline": "Ucrania: Más de Tres Años de Guerra a Gran Escala Sin Final a la Vista",
        "heroSubtitle": "Seguimiento de la invasión rusa de Ucrania desde febrero de 2022: ofensivas y contraofensivas, la crisis energética europea, sanciones, ayuda occidental, y las negociaciones estancadas.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de ISW, Estado Mayor de Ucrania, Ministerio de Defensa del Reino Unido, y medios internacionales. Todas las cifras disputadas están marcadas.",
    },
    "usa-latam-interventions": {
        "operationName": "Intervenciones de EE.UU. en Latinoamérica",
        "heroHeadline": "EE.UU. en Latinoamérica: Más de un Siglo de Intervenciones Militares y Encubiertas",
        "heroSubtitle": "Seguimiento de las intervenciones de Estados Unidos en América Latina desde 1898: golpes de estado, invasiones, operaciones encubiertas de la CIA, la Doctrina Monroe, y su impacto duradero en la soberanía regional.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de documentos desclasificados de la CIA/NSA, informes del Congreso de EE.UU., y estudios académicos. Todas las cifras estimadas están marcadas.",
    },
    "world-cup-2026": {
        "operationName": "Copa Mundial 2026",
        "heroHeadline": "Copa Mundial 2026: El Mundial Más Grande de la Historia Se Acerca",
        "heroSubtitle": "Seguimiento del Mundial FIFA 2026 en México, EE.UU. y Canadá: 48 equipos, 104 partidos, 16 ciudades sede, y el torneo de fútbol más grande jamás organizado.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de FIFA, comités organizadores locales, y medios deportivos internacionales. Todas las cifras están actualizadas a la fecha indicada.",
    },
    "world-war-1": {
        "operationName": "Primera Guerra Mundial",
        "heroHeadline": "La Gran Guerra: El Conflicto que Destruyó Imperios y Redefinió el Mapa del Mundo",
        "heroSubtitle": "Seguimiento de la Primera Guerra Mundial (1914–1918): desde el asesinato del Archiduque Franz Ferdinand hasta el Tratado de Versalles, pasando por las trincheras, las armas químicas y millones de muertos.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de fuentes históricas, archivos nacionales, y estudios militares. Todas las cifras estimadas están marcadas.",
    },
    "world-war-2": {
        "operationName": "Segunda Guerra Mundial",
        "heroHeadline": "La Segunda Guerra Mundial: El Conflicto Más Devastador de la Historia de la Humanidad",
        "heroSubtitle": "Seguimiento de la Segunda Guerra Mundial (1939–1945): desde la invasión de Polonia hasta la rendición de Japón, pasando por el Holocausto, las bombas atómicas, y 70–85 millones de muertos.",
        "dateline": "DÍA {dayCount} — MARZO 2026 — REPORTE DE SITUACIÓN",
        "footerNote": "Datos compilados de fuentes históricas, archivos nacionales, y estudios militares. Todas las cifras estimadas están marcadas.",
    },
}


def translate_dateline(original: str, slug: str, meta: dict) -> str:
    """Translate a dateline string to Spanish."""
    # If we have a specific translation in META_TRANSLATIONS, use it
    if slug in META_TRANSLATIONS and "dateline" in META_TRANSLATIONS[slug]:
        template = META_TRANSLATIONS[slug]["dateline"]
        day_count = meta.get("dayCount", "")
        return template.replace("{dayCount}", str(day_count))

    # Generic pattern translation
    text = original

    # "DAY X" -> "DÍA X"
    text = re.sub(r'\bDAY\b', 'DÍA', text)

    # Month translations
    months = {
        "JANUARY": "ENERO", "FEBRUARY": "FEBRERO", "MARCH": "MARZO",
        "APRIL": "ABRIL", "MAY": "MAYO", "JUNE": "JUNIO",
        "JULY": "JULIO", "AUGUST": "AGOSTO", "SEPTEMBER": "SEPTIEMBRE",
        "OCTOBER": "OCTUBRE", "NOVEMBER": "NOVIEMBRE", "DECEMBER": "DICIEMBRE",
        "January": "Enero", "February": "Febrero", "March": "Marzo",
        "April": "Abril", "May": "Mayo", "June": "Junio",
        "July": "Julio", "August": "Agosto", "September": "Septiembre",
        "October": "Octubre", "November": "Noviembre", "December": "Diciembre",
    }
    for en, es in months.items():
        text = text.replace(en, es)

    # Common dateline phrases
    text = text.replace("SITUATION REPORT", "REPORTE DE SITUACIÓN")
    text = text.replace("STATUS REPORT", "REPORTE DE ESTADO")
    text = text.replace("INVESTIGATION STATUS", "ESTADO DE LA INVESTIGACIÓN")
    text = text.replace("INTELLIGENCE SUMMARY", "RESUMEN DE INTELIGENCIA")
    text = text.replace("MISSION STATUS", "ESTADO DE LA MISIÓN")
    text = text.replace("STATUS UPDATE", "ACTUALIZACIÓN DE ESTADO")
    text = text.replace("CAREER STATUS", "ESTADO DE CARRERA")
    text = text.replace("MARKET ANALYSIS", "ANÁLISIS DE MERCADO")
    text = text.replace("LEGACY REPORT", "REPORTE DE LEGADO")
    text = text.replace("CONFLICT STATUS", "ESTADO DEL CONFLICTO")
    text = text.replace("TOURNAMENT STATUS", "ESTADO DEL TORNEO")
    text = text.replace("HISTORICAL RECORD", "REGISTRO HISTÓRICO")
    text = text.replace("PHYSICS STATUS", "ESTADO DE LA FÍSICA")
    text = text.replace("Kennedy Space Center", "Centro Espacial Kennedy")

    return text


def translate_meta(meta: dict, slug: str) -> dict:
    """Translate meta.json fields, copying non-translatable fields as-is."""
    result = dict(meta)  # shallow copy

    translations = META_TRANSLATIONS.get(slug, {})

    # Translate heroHeadline
    if "heroHeadline" in translations:
        result["heroHeadline"] = translations["heroHeadline"]

    # Translate heroSubtitle
    if "heroSubtitle" in translations:
        result["heroSubtitle"] = translations["heroSubtitle"]

    # Translate dateline
    if "dateline" in meta:
        result["dateline"] = translate_dateline(meta["dateline"], slug, meta)

    # Translate footerNote
    if "footerNote" in translations:
        result["footerNote"] = translations["footerNote"]

    # Translate operationName
    if "operationName" in translations:
        result["operationName"] = translations["operationName"]

    return result


def translate_kpi_label(label: str) -> str:
    """Translate a single KPI label to Spanish."""
    if label in KPI_LABEL_MAP:
        return KPI_LABEL_MAP[label]
    # If not found in map, return original (shouldn't happen for known labels)
    print(f"  WARNING: No translation for KPI label: {label!r}", file=sys.stderr)
    return label


def translate_kpis(kpis: list) -> list:
    """Translate kpis.json — only the label field, everything else copied as-is."""
    result = []
    for item in kpis:
        translated = dict(item)
        if "label" in translated:
            translated["label"] = translate_kpi_label(translated["label"])
        result.append(translated)
    return result


def main():
    trackers_processed = 0
    warnings = 0

    for slug in sorted(os.listdir(TRACKERS_DIR)):
        tracker_dir = TRACKERS_DIR / slug
        if not tracker_dir.is_dir():
            continue

        meta_path = tracker_dir / "data" / "meta.json"
        kpis_path = tracker_dir / "data" / "kpis.json"

        if not meta_path.exists() or not kpis_path.exists():
            print(f"SKIP {slug}: missing data files")
            continue

        # Check if tracker is a draft
        config_path = tracker_dir / "tracker.json"
        if config_path.exists():
            config = json.loads(config_path.read_text())
            if config.get("draft", False):
                print(f"SKIP {slug}: draft tracker")
                continue

        # Create data-es directory
        data_es_dir = tracker_dir / "data-es"
        data_es_dir.mkdir(exist_ok=True)

        # Read source files
        meta = json.loads(meta_path.read_text())
        kpis = json.loads(kpis_path.read_text())

        # Check for missing translations
        if slug not in META_TRANSLATIONS:
            print(f"  WARNING: No META_TRANSLATIONS for {slug}", file=sys.stderr)
            warnings += 1

        # Translate
        meta_es = translate_meta(meta, slug)
        kpis_es = translate_kpis(kpis)

        # Write translated files
        meta_es_path = data_es_dir / "meta.json"
        kpis_es_path = data_es_dir / "kpis.json"

        meta_es_path.write_text(
            json.dumps(meta_es, indent=2, ensure_ascii=False) + "\n"
        )
        kpis_es_path.write_text(
            json.dumps(kpis_es, indent=2, ensure_ascii=False) + "\n"
        )

        trackers_processed += 1
        print(f"OK {slug}: meta.json ({len(meta_es)} fields), kpis.json ({len(kpis_es)} items)")

    print(f"\nDone: {trackers_processed} trackers processed, {warnings} warnings")


if __name__ == "__main__":
    main()
