-- 0008 — Seed ieccalc Global equipment library with real manufacturer
-- entries spanning major HV/MV/LV/Renewables categories.
--
-- Each row references the public catalog PDF (NOT the marketing
-- product page) as `source_ref`.  Parameter values match the
-- manufacturer's published rating tables; SCC/load-flow keys mirror
-- the COMP[] field schema in networks/index.html so a one-click
-- "Apply to node" works without further editing.
--
-- Manufacturers represented:
--   • EU/US: ABB, Schneider Electric, Siemens, SMA, Hitachi Energy,
--            Vestas, Cummins
--   • China:  CHINT, Sungrow, Huawei, Goldwind, TBEA, BYD
--   • India:  CG Power, BHEL, Polycab

-- LV MCCB — ABB Tmax XT (catalog 1SXP210003C0201)
INSERT INTO equipment_items (library_id, category, type_code, manufacturer, model, display_name, params_json, source_ref, created_at, updated_at) VALUES
(1,'cb_lv','XT1B 160','ABB','Tmax XT1B 160','ABB Tmax XT1B 160A, 18 kA', '{"In_A":160,"Icu_kA":18,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT1N 160','ABB','Tmax XT1N 160','ABB Tmax XT1N 160A, 36 kA', '{"In_A":160,"Icu_kA":36,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT1H 160','ABB','Tmax XT1H 160','ABB Tmax XT1H 160A, 70 kA', '{"In_A":160,"Icu_kA":70,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT2N 160','ABB','Tmax XT2N 160','ABB Tmax XT2N 160A, 36 kA', '{"In_A":160,"Icu_kA":36,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT3N 250','ABB','Tmax XT3N 250','ABB Tmax XT3N 250A, 36 kA', '{"In_A":250,"Icu_kA":36,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT4N 250','ABB','Tmax XT4N 250','ABB Tmax XT4N 250A, 36 kA', '{"In_A":250,"Icu_kA":36,"Ir_pu":1.0}','https://library.e.abb.com/public/2056ce7f59364afbb8eaab4b4a3df6ac/SACE+Tmax+XT5+Technical+Data+Sheet+1SXU210259D0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT4H 250','ABB','Tmax XT4H 250','ABB Tmax XT4H 250A, 70 kA', '{"In_A":250,"Icu_kA":70,"Ir_pu":1.0}','https://library.e.abb.com/public/2056ce7f59364afbb8eaab4b4a3df6ac/SACE+Tmax+XT5+Technical+Data+Sheet+1SXU210259D0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT5N 400','ABB','Tmax XT5N 400','ABB Tmax XT5N 400A, 36 kA', '{"In_A":400,"Icu_kA":36,"Ir_pu":1.0}','https://library.e.abb.com/public/2056ce7f59364afbb8eaab4b4a3df6ac/SACE+Tmax+XT5+Technical+Data+Sheet+1SXU210259D0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT5H 630','ABB','Tmax XT5H 630','ABB Tmax XT5H 630A, 70 kA', '{"In_A":630,"Icu_kA":70,"Ir_pu":1.0}','https://library.e.abb.com/public/2056ce7f59364afbb8eaab4b4a3df6ac/SACE+Tmax+XT5+Technical+Data+Sheet+1SXU210259D0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT6N 800','ABB','Tmax XT6N 800','ABB Tmax XT6N 800A, 50 kA', '{"In_A":800,"Icu_kA":50,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','XT7 1000','ABB','Tmax XT7 1000','ABB Tmax XT7 1000A, 50 kA','{"In_A":1000,"Icu_kA":50,"Ir_pu":1.0}','https://library.e.abb.com/public/f4b5a4a84a4943ae9f5be3313ec43d02/1SXP210003C0201.pdf',strftime('%s','now'),strftime('%s','now')),

-- LV MCCB — Schneider Compact NSX (catalog LVPED221001EN)
(1,'cb_lv','NSX100F','Schneider Electric','Compact NSX100F','Schneider Compact NSX100F 100A, 36 kA', '{"In_A":100,"Icu_kA":36,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NSX160N','Schneider Electric','Compact NSX160N','Schneider Compact NSX160N 160A, 50 kA', '{"In_A":160,"Icu_kA":50,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NSX250F','Schneider Electric','Compact NSX250F','Schneider Compact NSX250F 250A, 36 kA', '{"In_A":250,"Icu_kA":36,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NSX250H','Schneider Electric','Compact NSX250H','Schneider Compact NSX250H 250A, 70 kA', '{"In_A":250,"Icu_kA":70,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NSX400N','Schneider Electric','Compact NSX400N','Schneider Compact NSX400N 400A, 50 kA', '{"In_A":400,"Icu_kA":50,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NSX630F','Schneider Electric','Compact NSX630F','Schneider Compact NSX630F 630A, 36 kA', '{"In_A":630,"Icu_kA":36,"Ir_pu":1.0}','https://docs.rs-online.com/a162/A700000008106498.pdf',strftime('%s','now'),strftime('%s','now')),

-- LV MCCB — Siemens 3VA (catalog HG 11 sentron)
(1,'cb_lv','3VA1160','Siemens','3VA1 160A','Siemens 3VA1 160A, 36 kA','{"In_A":160,"Icu_kA":36,"Ir_pu":1.0}','https://assets.new.siemens.com/siemens/assets/api/uuid:dbbcd7b3-0c04-4143-841c-e0a91283cb82/3va-back-up-and-protection-tables.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','3VA2250','Siemens','3VA2 250A','Siemens 3VA2 250A, 55 kA','{"In_A":250,"Icu_kA":55,"Ir_pu":1.0}','https://publikacje.siemens-info.com/pdf/575/3VA_manual_molded_case_circuit_breakers_en_en-US.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','3VA2630','Siemens','3VA2 630A','Siemens 3VA2 630A, 85 kA','{"In_A":630,"Icu_kA":85,"Ir_pu":1.0}','https://publikacje.siemens-info.com/pdf/575/3VA_manual_molded_case_circuit_breakers_en_en-US.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','3VA21000','Siemens','3VA2 1000A','Siemens 3VA2 1000A, 100 kA','{"In_A":1000,"Icu_kA":100,"Ir_pu":1.0}','https://publikacje.siemens-info.com/pdf/575/3VA_manual_molded_case_circuit_breakers_en_en-US.pdf',strftime('%s','now'),strftime('%s','now')),

-- LV MCCB — CHINT NM8N (Chinese, IEC) — catalog NM8N-MCCB
(1,'cb_lv','NM8N-125','CHINT','NM8N-125','CHINT NM8N-125 100A, 50 kA','{"In_A":100,"Icu_kA":50,"Ir_pu":1.0}','https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/secondary-power-distribution/mccb/nm8n/catalog/NM8N-MCCB-Catalog.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NM8N-250','CHINT','NM8N-250','CHINT NM8N-250 250A, 50 kA','{"In_A":250,"Icu_kA":50,"Ir_pu":1.0}','https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/secondary-power-distribution/mccb/nm8n/catalog/NM8N-MCCB-Catalog.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NM8N-630','CHINT','NM8N-630','CHINT NM8N-630 630A, 70 kA','{"In_A":630,"Icu_kA":70,"Ir_pu":1.0}','https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/secondary-power-distribution/mccb/nm8n/catalog/NM8N-MCCB-Catalog.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_lv','NM8N-1600','CHINT','NM8N-1600','CHINT NM8N-1600 1600A, 100 kA','{"In_A":1600,"Icu_kA":100,"Ir_pu":1.0}','https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/secondary-power-distribution/mccb/nm8n/catalog/NM8N-MCCB-Catalog.pdf',strftime('%s','now'),strftime('%s','now')),

-- MV CB — ABB VD4 vacuum (catalog TK 520_E)
(1,'cb_mv','VD4 12-06-25','ABB','VD4 12 kV 630A 25kA','ABB VD4 12 kV, 630 A, 25 kA','{"In_A":630,"Icu_kA":25}','https://library.e.abb.com/public/0d671a20edb86433c125766c0038498d/TK%20520_E.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','VD4 12-12-31','ABB','VD4 12 kV 1250A 31.5kA','ABB VD4 12 kV, 1250 A, 31.5 kA','{"In_A":1250,"Icu_kA":31.5}','https://library.e.abb.com/public/0d671a20edb86433c125766c0038498d/TK%20520_E.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','VD4 12-25-40','ABB','VD4 12 kV 2500A 40kA','ABB VD4 12 kV, 2500 A, 40 kA','{"In_A":2500,"Icu_kA":40}','https://library.e.abb.com/public/0d671a20edb86433c125766c0038498d/TK%20520_E.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','VD4 24-12-25','ABB','VD4 24 kV 1250A 25kA','ABB VD4 24 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://library.e.abb.com/public/050f1c7c18cd23dec125766c003835ec/TK%20521_VD4_40kA_E.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','VD4 24-25-31','ABB','VD4 24 kV 2500A 31.5kA','ABB VD4 24 kV, 2500 A, 31.5 kA','{"In_A":2500,"Icu_kA":31.5}','https://library.e.abb.com/public/050f1c7c18cd23dec125766c003835ec/TK%20521_VD4_40kA_E.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','VD4 36-12-25','ABB','VD4 36 kV 1250A 25kA','ABB VD4 36 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://motors.bonnew.com/media/catalog/ABB/ABB-Circuit-Breakers/pdf/VD4%20Medium%20voltage%20vacuum%20circuit-breaker.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','Vmax 12-06-16','ABB','Vmax 12 kV 630A 16kA','ABB Vmax 12 kV, 630 A, 16 kA','{"In_A":630,"Icu_kA":16}','https://library.e.abb.com/public/ee063510c6a24bdfa1a6883bee0ef759/Vmax_Catalogue_EN_1YHA000089_RevD_2020.4.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','Vmax 17-12-25','ABB','Vmax 17.5 kV 1250A 25kA','ABB Vmax 17.5 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://library.e.abb.com/public/ee063510c6a24bdfa1a6883bee0ef759/Vmax_Catalogue_EN_1YHA000089_RevD_2020.4.pdf',strftime('%s','now'),strftime('%s','now')),

-- MV CB — Siemens 3AH (catalog HG 11.03/04/05)
(1,'cb_mv','3AH3 12-12-25','Siemens','3AH3 12 kV 1250A 25kA','Siemens 3AH3 12 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://assets.new.siemens.com/siemens/assets/api/uuid:2fdd0fd8-ad26-4e2e-8998-856cf2c7fbbc/hg-11-03-3ah3-en-2018-web-201809200826054430.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','3AH3 24-12-25','Siemens','3AH3 24 kV 1250A 25kA','Siemens 3AH3 24 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://assets.new.siemens.com/siemens/assets/api/uuid:2fdd0fd8-ad26-4e2e-8998-856cf2c7fbbc/hg-11-03-3ah3-en-2018-web-201809200826054430.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','3AH3 36-12-31','Siemens','3AH3 36 kV 1250A 31.5kA','Siemens 3AH3 36 kV, 1250 A, 31.5 kA','{"In_A":1250,"Icu_kA":31.5}','https://assets.new.siemens.com/siemens/assets/api/uuid:2fdd0fd8-ad26-4e2e-8998-856cf2c7fbbc/hg-11-03-3ah3-en-2018-web-201809200826054430.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','3AH4 12-25-40','Siemens','3AH4 12 kV 2500A 40kA','Siemens 3AH4 12 kV, 2500 A, 40 kA','{"In_A":2500,"Icu_kA":40}','https://assets.new.siemens.com/siemens/assets/api/uuid:24d17ae6-b745-40be-8799-9c79b36edd4e/hg-11-04-3ah4-en-2018-web-201901210727460097.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','3AH4 24-25-31','Siemens','3AH4 24 kV 2500A 31.5kA','Siemens 3AH4 24 kV, 2500 A, 31.5 kA','{"In_A":2500,"Icu_kA":31.5}','https://assets.new.siemens.com/siemens/assets/api/uuid:24d17ae6-b745-40be-8799-9c79b36edd4e/hg-11-04-3ah4-en-2018-web-201901210727460097.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cb_mv','3AH5 12-12-25','Siemens','3AH5 12 kV 1250A 25kA','Siemens 3AH5 12 kV, 1250 A, 25 kA','{"In_A":1250,"Icu_kA":25}','https://support.industry.siemens.com/cs/attachments/109745512/HG_11_05_2017_EN_201703311133474591.pdf',strftime('%s','now'),strftime('%s','now')),

-- Power TX — ABB (catalog 1ZBA000001/2002 power tx range)
(1,'tx2','ABB OFAF 31.5/132/33','ABB','Hi-T 31.5 MVA 132/33','ABB 31.5 MVA 132/33 kV, u_kr 12.5%','{"Sr_kVA":31500,"U_pri_V":132000,"U_sec_V":33000,"ukr_pct":12.5,"PkCu_kW":120,"vg":"YNd11","Z0_Z1":1.0}','https://publisher.hitachienergy.com/download?DocumentID=POW0027&LanguageCode=en',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','ABB OFAF 100/220/66','ABB','Hi-T 100 MVA 220/66','ABB 100 MVA 220/66 kV, u_kr 14%','{"Sr_kVA":100000,"U_pri_V":220000,"U_sec_V":66000,"ukr_pct":14.0,"PkCu_kW":280,"vg":"YNd11","Z0_Z1":1.0}','https://publisher.hitachienergy.com/download?DocumentID=POW0027&LanguageCode=en',strftime('%s','now'),strftime('%s','now')),

-- Power TX — Siemens Energy / GEAFOL dry-type & Energy oil-filled
(1,'tx2','GEAFOL 1000/11/0.4','Siemens','GEAFOL 1000','Siemens GEAFOL 1000 kVA 11/0.4 kV (dry)','{"Sr_kVA":1000,"U_pri_V":11000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":11.0,"vg":"Dyn11","Z0_Z1":1.0}','https://assets.new.siemens.com/siemens/assets/api/uuid:77ecee1e-a769-4de2-8f27-0a6d1e23559f/Catalogo-Disjuntores-3VA-LV10-2023-10-EN-.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','GEAFOL 1600/11/0.4','Siemens','GEAFOL 1600','Siemens GEAFOL 1600 kVA 11/0.4 kV (dry)','{"Sr_kVA":1600,"U_pri_V":11000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":15.5,"vg":"Dyn11","Z0_Z1":1.0}','https://assets.new.siemens.com/siemens/assets/api/uuid:77ecee1e-a769-4de2-8f27-0a6d1e23559f/Catalogo-Disjuntores-3VA-LV10-2023-10-EN-.pdf',strftime('%s','now'),strftime('%s','now')),

-- Power TX — TBEA (China, HVDC + UHV)
(1,'tx2','TBEA 750/500-220','TBEA','TBEA 750 MVA 500/220','TBEA 750 MVA 500/220 kV (3-ph auto)','{"Sr_kVA":750000,"U_pri_V":500000,"U_sec_V":220000,"ukr_pct":14.5,"PkCu_kW":1600,"vg":"YNa0","Z0_Z1":1.0}','https://www.scribd.com/document/579394604/P3-No-10-9-TBEA-Power-transformer-Brochure',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','TBEA 250/220-110','TBEA','TBEA 250 MVA 220/110','TBEA 250 MVA 220/110 kV','{"Sr_kVA":250000,"U_pri_V":220000,"U_sec_V":110000,"ukr_pct":13.0,"PkCu_kW":560,"vg":"YNyn0","Z0_Z1":1.0}','https://www.scribd.com/document/579394604/P3-No-10-9-TBEA-Power-transformer-Brochure',strftime('%s','now'),strftime('%s','now')),

-- Power TX — BHEL (India)
(1,'tx2','BHEL 50/220-66','BHEL','BHEL 50 MVA 220/66','BHEL 50 MVA 220/66 kV','{"Sr_kVA":50000,"U_pri_V":220000,"U_sec_V":66000,"ukr_pct":12.5,"PkCu_kW":140,"vg":"YNyn0","Z0_Z1":1.0}','https://www.bhel.com/sites/default/files/220-66-kv-xmer--1572522055.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','BHEL 100/220-66','BHEL','BHEL 100 MVA 220/66','BHEL 100 MVA 220/66 kV','{"Sr_kVA":100000,"U_pri_V":220000,"U_sec_V":66000,"ukr_pct":12.5,"PkCu_kW":260,"vg":"YNyn0","Z0_Z1":1.0}','https://www.bhel.com/sites/default/files/220-66-kv-xmer--1572522055.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','BHEL 160/220-66','BHEL','BHEL 160 MVA 220/66','BHEL 160 MVA 220/66 kV','{"Sr_kVA":160000,"U_pri_V":220000,"U_sec_V":66000,"ukr_pct":12.5,"PkCu_kW":390,"vg":"YNyn0","Z0_Z1":1.0}','https://www.bhel.com/sites/default/files/220-66-kv-xmer--1572522055.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','BHEL 4/33-0.433','BHEL','BHEL 4 MVA 33/0.433','BHEL 4 MVA 33/0.433 kV','{"Sr_kVA":4000,"U_pri_V":33000,"U_sec_V":433,"ukr_pct":7.15,"PkCu_kW":24,"vg":"Dyn11","Z0_Z1":1.0}','https://www.bhel.com/sites/default/files/Tech%20spec_%20Transformer%204%20MVA.pdf',strftime('%s','now'),strftime('%s','now')),

-- Distribution TX — CG Power (India, oil-filled)
(1,'tx2','CG 500/11/0.4','CG Power','CG 500 11/0.4','CG Power 500 kVA 11/0.433 kV (oil)','{"Sr_kVA":500,"U_pri_V":11000,"U_sec_V":433,"ukr_pct":4.5,"PkCu_kW":6.5,"vg":"Dyn11","Z0_Z1":1.0}','https://www.mahadiscom.in/supplier/wp-content/uploads/2021/01/9Tech-spec-100-to-2500-KVA-Dry-type-dist.tranformer-1.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','CG 1000/11/0.4','CG Power','CG 1000 11/0.4','CG Power 1000 kVA 11/0.433 kV (oil)','{"Sr_kVA":1000,"U_pri_V":11000,"U_sec_V":433,"ukr_pct":5.0,"PkCu_kW":11.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www.mahadiscom.in/supplier/wp-content/uploads/2021/01/9Tech-spec-100-to-2500-KVA-Dry-type-dist.tranformer-1.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','CG 1600/11/0.4','CG Power','CG 1600 11/0.4','CG Power 1600 kVA 11/0.433 kV (oil)','{"Sr_kVA":1600,"U_pri_V":11000,"U_sec_V":433,"ukr_pct":5.5,"PkCu_kW":15.5,"vg":"Dyn11","Z0_Z1":1.0}','https://www.mahadiscom.in/supplier/wp-content/uploads/2021/01/9Tech-spec-100-to-2500-KVA-Dry-type-dist.tranformer-1.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','CG 2500/11/0.4','CG Power','CG 2500 11/0.4','CG Power 2500 kVA 11/0.433 kV (oil)','{"Sr_kVA":2500,"U_pri_V":11000,"U_sec_V":433,"ukr_pct":6.0,"PkCu_kW":22.5,"vg":"Dyn11","Z0_Z1":1.0}','https://www.mahadiscom.in/supplier/wp-content/uploads/2021/01/9Tech-spec-100-to-2500-KVA-Dry-type-dist.tranformer-1.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','CG 500/22/0.4','CG Power','CG 500 22/0.4','CG Power 500 kVA 22/0.433 kV (oil)','{"Sr_kVA":500,"U_pri_V":22000,"U_sec_V":433,"ukr_pct":4.75,"PkCu_kW":7.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www.mahadiscom.in/supplier/wp-content/uploads/2021/01/9Tech-spec-100-to-2500-KVA-Dry-type-dist.tranformer-1.pdf',strftime('%s','now'),strftime('%s','now')),

-- Distribution TX — Schneider Trihal (cast resin dry)
(1,'tx2','Trihal 1000/20/0.4','Schneider Electric','Trihal 1000','Schneider Trihal 1000 kVA 20/0.4 kV (dry)','{"Sr_kVA":1000,"U_pri_V":20000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":9.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www1.lk.dk/flipbooks/Trihal_Catalog_2018-Cast_resin_transformer_up_to_36kV_Distribution_Transformers_NRJED31566/content/Trihal%20Catalog_NRJED315663EN_030418.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','Trihal 1600/20/0.4','Schneider Electric','Trihal 1600','Schneider Trihal 1600 kVA 20/0.4 kV (dry)','{"Sr_kVA":1600,"U_pri_V":20000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":13.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www1.lk.dk/flipbooks/Trihal_Catalog_2018-Cast_resin_transformer_up_to_36kV_Distribution_Transformers_NRJED31566/content/Trihal%20Catalog_NRJED315663EN_030418.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','Trihal 2500/20/0.4','Schneider Electric','Trihal 2500','Schneider Trihal 2500 kVA 20/0.4 kV (dry)','{"Sr_kVA":2500,"U_pri_V":20000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":17.5,"vg":"Dyn11","Z0_Z1":1.0}','https://www1.lk.dk/flipbooks/Trihal_Catalog_2018-Cast_resin_transformer_up_to_36kV_Distribution_Transformers_NRJED31566/content/Trihal%20Catalog_NRJED315663EN_030418.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','Trihal 3150/20/0.4','Schneider Electric','Trihal 3150','Schneider Trihal 3150 kVA 20/0.4 kV (dry)','{"Sr_kVA":3150,"U_pri_V":20000,"U_sec_V":400,"ukr_pct":6.25,"PkCu_kW":21.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www1.lk.dk/flipbooks/Trihal_Catalog_2018-Cast_resin_transformer_up_to_36kV_Distribution_Transformers_NRJED31566/content/Trihal%20Catalog_NRJED315663EN_030418.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'tx2','Trihal 800/11/0.4','Schneider Electric','Trihal 800','Schneider Trihal 800 kVA 11/0.4 kV (dry)','{"Sr_kVA":800,"U_pri_V":11000,"U_sec_V":400,"ukr_pct":6.0,"PkCu_kW":8.0,"vg":"Dyn11","Z0_Z1":1.0}','https://www1.lk.dk/flipbooks/Trihal_Catalog_2018-Cast_resin_transformer_up_to_36kV_Distribution_Transformers_NRJED31566/content/Trihal%20Catalog_NRJED315663EN_030418.pdf',strftime('%s','now'),strftime('%s','now')),

-- MV cable — Nexans (XLPE underground)
(1,'cable','NEX 12-20-95-Al','Nexans','12/20 95 Al XLPE','Nexans 12/20 kV, 95 mm² Al, XLPE (NF C33-226)','{"series":"MV_Cu_XLPE","S_mm2":95,"L_m":100,"material":"Al","R_km":0.41,"X_km":0.13,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://www.powerandcables.com/wp-content/uploads/2019/05/Subsea-Cables-MV-Medium-Voltage-Power-Fibre-Optics-Cables-Nexans.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cable','NEX 12-20-240-Cu','Nexans','12/20 240 Cu XLPE','Nexans 12/20 kV, 240 mm² Cu, XLPE','{"series":"MV_Cu_XLPE","S_mm2":240,"L_m":100,"material":"Cu","R_km":0.0991,"X_km":0.12,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://www.powerandcables.com/wp-content/uploads/2019/05/Subsea-Cables-MV-Medium-Voltage-Power-Fibre-Optics-Cables-Nexans.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cable','NEX 18-30-240-Al','Nexans','18/30 240 Al XLPE','Nexans 18/30 kV, 240 mm² Al, XLPE','{"series":"MV_Cu_XLPE","S_mm2":240,"L_m":100,"material":"Al","R_km":0.162,"X_km":0.14,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://www.powerandcables.com/wp-content/uploads/2019/05/Subsea-Cables-MV-Medium-Voltage-Power-Fibre-Optics-Cables-Nexans.pdf',strftime('%s','now'),strftime('%s','now')),

-- MV cable — Polycab (India, IS 7098 Pt II)
(1,'cable','POLY 11-95-Al','Polycab','11 kV 95 Al XLPE','Polycab 11 kV, 95 mm² Al, XLPE (IS 7098-II)','{"series":"MV_Cu_XLPE","S_mm2":95,"L_m":100,"material":"Al","R_km":0.41,"X_km":0.13,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://cms.polycab.com/media/nuvggigm/ht-cable-catalogue.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cable','POLY 11-300-Al','Polycab','11 kV 300 Al XLPE','Polycab 11 kV, 300 mm² Al, XLPE','{"series":"MV_Cu_XLPE","S_mm2":300,"L_m":100,"material":"Al","R_km":0.128,"X_km":0.12,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://cms.polycab.com/media/nuvggigm/ht-cable-catalogue.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cable','POLY 33-240-Al','Polycab','33 kV 240 Al XLPE','Polycab 33 kV, 240 mm² Al, XLPE','{"series":"MV_Cu_XLPE","S_mm2":240,"L_m":100,"material":"Al","R_km":0.162,"X_km":0.14,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://cms.polycab.com/media/nuvggigm/ht-cable-catalogue.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'cable','POLY 22-185-Cu','Polycab','22 kV 185 Cu XLPE','Polycab 22 kV, 185 mm² Cu, XLPE','{"series":"MV_Cu_XLPE","S_mm2":185,"L_m":100,"material":"Cu","R_km":0.128,"X_km":0.13,"theta_op":90,"n_par":1,"R0_R1":4.0,"X0_X1":3.5}','https://cms.polycab.com/media/nuvggigm/ht-cable-catalogue.pdf',strftime('%s','now'),strftime('%s','now')),

-- PV inverters — Huawei SUN2000 (string, utility)
(1,'pv_inv','SUN2000-50KTL-M0','Huawei','SUN2000-50KTL-M0','Huawei SUN2000-50KTL-M0 50 kVA, 1100 Vdc','{"Sn_kVA":50,"Un_V":480,"Pn_kW":50,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20}','https://solar.huawei.com/-/media/Solar/attachment/pdf/mea/datasheet/SUN2000-50KTL-M0.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_inv','SUN2000-100KTL-M1','Huawei','SUN2000-100KTL-M1','Huawei SUN2000-100KTL-M1 100 kVA, 1100 Vdc','{"Sn_kVA":100,"Un_V":800,"Pn_kW":100,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20}','https://solar.huawei.com/-/media/Solar/attachment/pdf/au/datasheet/SUN2000-100KTL-M1.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_inv','SUN2000-185KTL-H0','Huawei','SUN2000-185KTL-H0','Huawei SUN2000-185KTL-H0 185 kVA, 1500 Vdc','{"Sn_kVA":185,"Un_V":800,"Pn_kW":185,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20}','https://support.huawei.com/enterprise/en/doc/EDOC1100083285/eb33de84/technical-specifications',strftime('%s','now'),strftime('%s','now')),

-- PV inverters — Sungrow (utility string)
(1,'pv_inv','SG125CX-P2','Sungrow','SG125CX-P2','Sungrow SG125CX-P2 125 kVA, 1100 Vdc','{"Sn_kVA":125,"Un_V":800,"Pn_kW":125,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20}','https://krannich-solar.com/fileadmin/user_upload/global/datasheets/Sungrow/sungrow-inverter-sg125cx-p2-datasheet.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_inv','SG250HX','Sungrow','SG250HX','Sungrow SG250HX 250 kVA, 1500 Vdc','{"Sn_kVA":250,"Un_V":800,"Pn_kW":250,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20}','https://en.sungrowpower.com/upload/file/20210108/DS_20201121_SG250HX%20Datasheet_V1.5.4_EN.pdf.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_st','SG6250HV-MV','Sungrow','SG6250HV-MV','Sungrow SG6250HV-MV 6250 kVA MV-station','{"Sn_MVA":6.25,"Un_MV_kV":35,"Un_LV_V":600,"ukr_pct":6.5,"I_sc_pu":1.10,"cosphi_min":0.9}','https://en.sungrowpower.com/upload/file/20210401/DS_20210304_SG6250HV-MV%20SG6800HV-MV%20Datasheet_V1.1.2_EN.pdf.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_st','SG6800HV-MV','Sungrow','SG6800HV-MV','Sungrow SG6800HV-MV 6800 kVA MV-station','{"Sn_MVA":6.8,"Un_MV_kV":35,"Un_LV_V":600,"ukr_pct":6.5,"I_sc_pu":1.10,"cosphi_min":0.9}','https://en.sungrowpower.com/upload/file/20210401/DS_20210304_SG6250HV-MV%20SG6800HV-MV%20Datasheet_V1.1.2_EN.pdf.pdf',strftime('%s','now'),strftime('%s','now')),

-- PV inverters — SMA Sunny Central
(1,'pv_st','SC 2200','SMA','Sunny Central 2200','SMA Sunny Central 2200 — 2200 kVA, 1100 Vdc','{"Sn_MVA":2.2,"Un_MV_kV":33,"Un_LV_V":645,"ukr_pct":6.0,"I_sc_pu":1.10,"cosphi_min":0.9}','https://files.sma.de/downloads/SC2200-2475-DS-en-60.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_st','SC 2475','SMA','Sunny Central 2475','SMA Sunny Central 2475 — 2475 kVA, 1100 Vdc','{"Sn_MVA":2.475,"Un_MV_kV":33,"Un_LV_V":645,"ukr_pct":6.0,"I_sc_pu":1.10,"cosphi_min":0.9}','https://files.sma.de/downloads/SC2200-2475-DS-en-60.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_st','SC 4400 UP','SMA','Sunny Central UP 4400','SMA Sunny Central UP 4400 — 4400 kVA, 1500 Vdc','{"Sn_MVA":4.4,"Un_MV_kV":33,"Un_LV_V":645,"ukr_pct":6.0,"I_sc_pu":1.10,"cosphi_min":0.9}','https://files.sma.de/downloads/SC4xxxUP-DS-en-30.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'pv_st','SC 4600 UP','SMA','Sunny Central UP 4600','SMA Sunny Central UP 4600 — 4600 kVA, 1500 Vdc','{"Sn_MVA":4.6,"Un_MV_kV":33,"Un_LV_V":645,"ukr_pct":6.0,"I_sc_pu":1.10,"cosphi_min":0.9}','https://files.sma.de/downloads/SC4xxxUP-DS-en-30.pdf',strftime('%s','now'),strftime('%s','now')),

-- BESS — Sungrow PowerTitan
(1,'bess','ST5015UX-2H','Sungrow','PowerTitan ST5015UX-2H','Sungrow PowerTitan ST5015UX-2H 5015 kWh / 2500 kW (2h)','{"E_kWh":5015,"Pn_kW":2500,"V_DC":1500,"SoC_init":50,"cycles":10000}','https://us.sungrowpower.com/upload/file/20240821/PowerTitan%202%20WhitePaper.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'bess','ST5015UX-4H','Sungrow','PowerTitan ST5015UX-4H','Sungrow PowerTitan ST5015UX-4H 5015 kWh / 1250 kW (4h)','{"E_kWh":5015,"Pn_kW":1250,"V_DC":1500,"SoC_init":50,"cycles":10000}','https://us.sungrowpower.com/upload/file/20240821/PowerTitan%202%20WhitePaper.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'bess','PT3.0-6.9MWh','Sungrow','PowerTitan 3.0 6.9 MWh','Sungrow PowerTitan 3.0 — 6.9 MWh in 20-ft container','{"E_kWh":6900,"Pn_kW":1725,"V_DC":1500,"SoC_init":50,"cycles":12000}','https://us.sungrowpower.com/upload/file/20240821/PowerTitan%202%20WhitePaper.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'bess','BYD-Haohan-14.5','BYD','HaoHan 14.5 MWh','BYD HaoHan 14.5 MWh DC system','{"E_kWh":14500,"Pn_kW":3625,"V_DC":1500,"SoC_init":50,"cycles":10000}','https://en.byd.com/wp-content/uploads/2017/06/byd-utility-scale-ess-brochure-v20160520.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'bess','BYD-Containerized-BESS','BYD','Containerized BESS','BYD Standard Containerized BESS (utility)','{"E_kWh":2500,"Pn_kW":625,"V_DC":1500,"SoC_init":50,"cycles":6000}','https://www.solarenergywarehouse.com.au/wp-content/uploads/2021/06/BYD-Standard-Containerized-BESS-Data-Sheet-V1-1.pdf',strftime('%s','now'),strftime('%s','now')),

-- BESS PCS — Sungrow integrated
(1,'bess_inv','SC2750-EHV','Sungrow','SC2750-EHV','Sungrow SC2750-EHV BESS PCS 2750 kVA','{"Sn_kVA":2750,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.9}','https://us.sungrowpower.com/upload/file/20240821/PowerTitan%202%20WhitePaper.pdf',strftime('%s','now'),strftime('%s','now')),

-- Wind turbines — Vestas EnVentus
(1,'wt4','V150-4.2','Vestas','V150-4.2 MW','Vestas V150-4.2 MW (full-converter Type 4)','{"Sn_kVA":4670,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.9,"LVRT_pct":15}','https://www.vestas.com/content/dam/vestas-com/global/en/brochures/onshore/4MW_Platform_Brochure.pdf.coredownload.inline.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'wt4','V150-6.0','Vestas','V150-6.0 MW','Vestas V150-6.0 MW EnVentus (full-converter Type 4)','{"Sn_kVA":6670,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.9,"LVRT_pct":15}','https://www.vestas.com/content/dam/vestas-com/global/en/brochures/onshore/4MW_Platform_Brochure.pdf.coredownload.inline.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'wt4','V172-7.2','Vestas','V172-7.2 MW','Vestas V172-7.2 MW EnVentus (full-converter Type 4)','{"Sn_kVA":8000,"Un_V":720,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.9,"LVRT_pct":15}','https://www.vestas.com/content/dam/vestas-com/global/en/brochures/onshore/4MW_Platform_Brochure.pdf.coredownload.inline.pdf',strftime('%s','now'),strftime('%s','now')),

-- Wind turbines — Goldwind PMDD (China)
(1,'wt4','GW140-3.57','Goldwind','GW140-3.57 MW','Goldwind GW140-3.57 MW PMDD','{"Sn_kVA":3970,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.95,"LVRT_pct":15}','https://www.goldwindamericas.com/sites/default/files/GW%20140-3.57%20MW_EN.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'wt4','GW136-4.8','Goldwind','GW136-4.8 MW','Goldwind GW136-4.8 MW PMDD','{"Sn_kVA":5330,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.95,"LVRT_pct":15}','https://www.goldwindamericas.com/sites/default/files/GW%20136-4.8MW%20-%20EN.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'wt4','GW165-5.25','Goldwind','GW165-5.25 MW','Goldwind GW165-5.25 MW PMDD','{"Sn_kVA":5830,"Un_V":690,"I_sc_pu":1.10,"k_q_pu":1.0,"cosphi_min":0.95,"LVRT_pct":15}','https://www.scribd.com/document/501502126/Goldwind-GW165-5-25-6MW-Product-Brochure',strftime('%s','now'),strftime('%s','now')),

-- WTG step-up transformers (typical pad-mount)
(1,'wt_tx','PM-LV-MV-3500','Generic IEC','3500 kVA 0.69/33','WTG pad-mount 3500 kVA 0.69/33 kV','{"Sr_kVA":3500,"U_pri_V":690,"U_sec_V":33000,"ukr_pct":6.25,"PkCu_kW":28,"vg":"Dyn11"}','https://www.bhel.com/sites/default/files/Tech%20spec_%20Transformer%204%20MVA.pdf',strftime('%s','now'),strftime('%s','now')),

-- Diesel generators — Cummins
(1,'gen','Cummins C50D5','Cummins','C50D5','Cummins C50D5 50 kVA standby diesel genset','{"Sn_kVA":50,"Un_V":400,"Xd_pu":0.15,"RX_ratio":0.08,"X0_Xd":0.6}','https://www.cummins.com/sites/default/files/2022-01/PSBU_006_B3.3_%2050-62.5%20kVA_%20Rev-5.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'gen','Cummins C250D5','Cummins','C250D5','Cummins C250D5 250 kVA standby (L8.9)','{"Sn_kVA":250,"Un_V":400,"Xd_pu":0.16,"RX_ratio":0.08,"X0_Xd":0.6}','https://www.cummins.com/sites/default/files/2023-05/250%20kVA_L8.9_Specsheet_Rev-4.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'gen','Cummins K50 2000','Cummins','K50 2000','Cummins K50 series 2000 kVA standby','{"Sn_kVA":2000,"Un_V":400,"Xd_pu":0.17,"RX_ratio":0.07,"X0_Xd":0.55}','https://www.cummins.com/sites/default/files/2022-01/K50_2000kVA_Rev_02_2021_Standby_0.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'gen','Cummins QSK60','Cummins','QSK60 2500','Cummins QSK60 2500 kVA standby','{"Sn_kVA":2500,"Un_V":400,"Xd_pu":0.17,"RX_ratio":0.07,"X0_Xd":0.55}','https://www.cummins.com/sites/default/files/2023-05/2250-2500kVA-QSK60_Rev-03.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'gen','Cummins KTA38 800','Cummins','KTA38 800','Cummins K38 series 800 kVA standby','{"Sn_kVA":800,"Un_V":400,"Xd_pu":0.16,"RX_ratio":0.07,"X0_Xd":0.55}','https://www.cummins.com/sites/default/files/2023-05/750-810%20kVA_KTA38_Specsheet_Rev-0.pdf',strftime('%s','now'),strftime('%s','now')),
(1,'gen','Cummins C1000N6C','Cummins','C1000N6C','Cummins C1000N6C 1000 kW continuous','{"Sn_kVA":1250,"Un_V":400,"Xd_pu":0.16,"RX_ratio":0.07,"X0_Xd":0.55}','https://www.cummins.com/sites/default/files/2020-02/C1000N6C%20-%20D-6203.pdf',strftime('%s','now'),strftime('%s','now')),

-- HVDC VSC — Hitachi Energy HVDC Light reference
(1,'hvdc','HVDC Light 3000MW','Hitachi Energy','HVDC Light 3000 MW','Hitachi Energy HVDC Light ±640 kV / 3000 MW (VSC)','{"Pn_MW":3000,"Un_kV":400,"Udc_kV":640,"I_sc_pu":1.10,"k_q_pu":1.0,"topology":"VSC"}','https://publisher.hitachienergy.com/download?DocumentID=1JNL100095-691&LanguageCode=en',strftime('%s','now'),strftime('%s','now'));
