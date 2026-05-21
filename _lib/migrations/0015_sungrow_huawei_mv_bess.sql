-- 0015 — Sungrow MV Stations + BESS + Huawei SUN2000-H1 utility inverters
-- Extracted from manufacturer PDF datasheets supplied by the user.
-- Catalog-verified; every numerical value reproducible against the
-- linked official Sungrow / Huawei datasheet.

INSERT INTO equipment_items (library_id, category, type_code, manufacturer, model, display_name, params_json, source_ref, verified, verified_at, verified_by, created_at, updated_at) VALUES

-- ── Sungrow MV Stations (packaged MV-side: AC-side fuse+switch+TX+MV swgr)
-- Source: DS_20241230_MVS3200-LV_4480-LV_Datasheet_V3_EN (MEA), version 3
(1, 'pv_st', 'MVS3200-LV', 'Sungrow', 'MVS3200-LV',
 'Sungrow MVS3200-LV MV Station (3200 kVA, 0.8/35 kV, for SG350HX)',
 '{"Sn_MVA":3.2,"Sn_kVA_peak":3520,"Un_LV_V":800,"Un_MV_kV":35,"ukr_pct":7.0,"vg":"Dyn11","I_pri_max_A":2540,"f_Hz":50,"cosphi_min":0.9,"I_sc_pu":1.10,"MV_swgr_type":"SF6","MV_swgr_U_kV":40.5,"MV_swgr_In_A":630,"MV_swgr_Ik_kA":20,"main_acb_In_A":4000,"main_acb_Un_V":800,"dim_W_mm":6058,"dim_H_mm":2896,"dim_D_mm":2438,"weight_t":15,"T_min_C":-20,"T_max_C":60,"IP_rating":"IP54"}',
 'https://en.sungrowpower.com/upload/file/MVS3200-LV_4480-LV_Datasheet_V3_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'MVS4480-LV', 'Sungrow', 'MVS4480-LV',
 'Sungrow MVS4480-LV MV Station (4480 kVA, 0.8/35 kV, for SG350HX)',
 '{"Sn_MVA":4.48,"Sn_kVA_peak":4928,"Un_LV_V":800,"Un_MV_kV":35,"ukr_pct":8.0,"vg":"Dyn11","I_pri_max_A":3557,"f_Hz":50,"cosphi_min":0.9,"I_sc_pu":1.10,"MV_swgr_type":"SF6","MV_swgr_U_kV":40.5,"MV_swgr_In_A":630,"MV_swgr_Ik_kA":20,"main_acb_In_A":4000,"main_acb_Un_V":800,"dim_W_mm":6058,"dim_H_mm":2896,"dim_D_mm":2438,"weight_t":17,"T_min_C":-20,"T_max_C":60,"IP_rating":"IP54"}',
 'https://en.sungrowpower.com/upload/file/MVS3200-LV_4480-LV_Datasheet_V3_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- ── Sungrow PowerTitan 2.0 BESS (5 015 kWh LFP, liquid-cooled)
-- Source: DS_20240320_ST5015UX-2H-3H-4H_Datasheet_V2_EN.pdf
(1, 'bess', 'ST5015UX-2H', 'Sungrow', 'PowerTitan 2.0 ST5015UX-2H',
 'Sungrow PowerTitan 2.0 ST5015UX-2H (5015 kWh / 2520 kVA AC, 2 h, LFP)',
 '{"E_kWh":5015,"Pn_kW":2520,"V_DC":1300,"V_DC_min":1123.2,"V_DC_max":1497.6,"cell_type":"LFP","cell_V":3.2,"cell_Ah":314,"config":"416S12P","n_PCS":12,"PCS_kVA":210,"Un_AC_V":690,"f_Hz":50,"weight_kg":42500,"dim_W_mm":6058,"dim_H_mm":2896,"dim_D_mm":2438,"IP_rating":"IP55","corrosion":"C4","T_min_C":-30,"T_max_C":50,"altitude_max_m":4500,"cooling":"liquid","duration_h":2}',
 'https://en.sungrowpower.com/upload/file/ST5015UX-2H-3H-4H_Datasheet_V2_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'bess', 'ST5015UX-3H', 'Sungrow', 'PowerTitan 2.0 ST5015UX-3H',
 'Sungrow PowerTitan 2.0 ST5015UX-3H (5015 kWh / 1524 kVA AC, 3 h, LFP)',
 '{"E_kWh":5015,"Pn_kW":1524,"V_DC":1300,"V_DC_min":1123.2,"V_DC_max":1497.6,"cell_type":"LFP","cell_V":3.2,"cell_Ah":314,"config":"416S12P","n_PCS":12,"PCS_kVA":127,"Un_AC_V":690,"f_Hz":50,"weight_kg":42500,"dim_W_mm":6058,"dim_H_mm":2896,"dim_D_mm":2438,"IP_rating":"IP55","corrosion":"C4","T_min_C":-30,"T_max_C":50,"altitude_max_m":4500,"cooling":"liquid","duration_h":3}',
 'https://en.sungrowpower.com/upload/file/ST5015UX-2H-3H-4H_Datasheet_V2_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'bess', 'ST5015UX-4H', 'Sungrow', 'PowerTitan 2.0 ST5015UX-4H',
 'Sungrow PowerTitan 2.0 ST5015UX-4H (5015 kWh / 1260 kVA AC, 4 h, LFP)',
 '{"E_kWh":5015,"Pn_kW":1260,"V_DC":1300,"V_DC_min":1123.2,"V_DC_max":1497.6,"cell_type":"LFP","cell_V":3.2,"cell_Ah":314,"config":"416S12P","n_PCS":6,"PCS_kVA":210,"Un_AC_V":690,"f_Hz":50,"weight_kg":42000,"dim_W_mm":6058,"dim_H_mm":2896,"dim_D_mm":2438,"IP_rating":"IP55","corrosion":"C4","T_min_C":-30,"T_max_C":50,"altitude_max_m":4500,"cooling":"liquid","duration_h":4}',
 'https://en.sungrowpower.com/upload/file/ST5015UX-2H-3H-4H_Datasheet_V2_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- ── Sungrow SC210HX PCS (PowerTitan 2.0 sub-component, also sold separately)
-- Source: DS_20230907_SC210HX_Datasheet_V2_EN.pdf
(1, 'bess_inv', 'SC210HX', 'Sungrow', 'SC210HX',
 'Sungrow SC210HX PCS (210 kVA, 690 V, 1500 Vdc, liquid-cooled)',
 '{"Sn_kVA":210,"Sn_kVA_peak":231,"Un_V":690,"Pn_kW":210,"cosphi_min":1.0,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_dc_max_V":1500,"V_dc_min_V":1000,"V_dc_range":"1000-1500","I_dc_max_A":212.8,"n_dc_inputs":1,"I_ac_max_A":176,"V_ac_min_V":621,"V_ac_max_V":759,"f_Hz":50,"eff_max_pct":99.0,"weight_kg":85,"dim_W_mm":790,"dim_H_mm":235,"dim_D_mm":880,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60,"altitude_max_m":4000,"cooling":"liquid"}',
 'https://en.sungrowpower.com/upload/file/SC210HX_Datasheet_V2_EN.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- ── Huawei SUN2000-H1 utility-scale string inverters
-- Source: solar.huawei.com/admin/asset/v1/pro/view/41b49585206f445db6e62c800a9f76ee.pdf
-- (SUN2000-330KTL-H1 datasheet)
-- Common family: 1500 Vdc, MPPT 500-1500 V, 6 MPPT, eff max 99.0% / Euro 98.8%
(1, 'pv_inv', 'SUN2000-250KTL-H1', 'Huawei', 'SUN2000-250KTL-H1',
 'Huawei SUN2000-250KTL-H1 (250 kVA, 1500 Vdc, 6 MPPT)',
 '{"Sn_kVA":250,"Pn_kW":250,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"eff_max_pct":99.0,"eff_euro_pct":98.8,"IP_rating":"IP66"}',
 'https://solar.huawei.com/en-GB/download?p=SUN2000-330KTL-H1_Datasheet.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_inv', 'SUN2000-280KTL-H1', 'Huawei', 'SUN2000-280KTL-H1',
 'Huawei SUN2000-280KTL-H1 (280 kVA, 1500 Vdc, 6 MPPT)',
 '{"Sn_kVA":280,"Pn_kW":280,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"eff_max_pct":99.0,"eff_euro_pct":98.8,"IP_rating":"IP66"}',
 'https://solar.huawei.com/en-GB/download?p=SUN2000-330KTL-H1_Datasheet.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_inv', 'SUN2000-300KTL-H1', 'Huawei', 'SUN2000-300KTL-H1',
 'Huawei SUN2000-300KTL-H1 (300 kVA, 1500 Vdc, 6 MPPT)',
 '{"Sn_kVA":300,"Pn_kW":300,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"eff_max_pct":99.0,"eff_euro_pct":98.8,"IP_rating":"IP66"}',
 'https://solar.huawei.com/en-GB/download?p=SUN2000-330KTL-H1_Datasheet.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_inv', 'SUN2000-330KTL-H1', 'Huawei', 'SUN2000-330KTL-H1',
 'Huawei SUN2000-330KTL-H1 (330 kVA, 1500 Vdc, 6 MPPT)',
 '{"Sn_kVA":330,"Pn_kW":330,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"eff_max_pct":99.0,"eff_euro_pct":98.8,"IP_rating":"IP66"}',
 'https://solar.huawei.com/en-GB/download?p=SUN2000-330KTL-H1_Datasheet.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now'));
