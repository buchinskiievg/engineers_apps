-- 0014 — Sungrow utility-scale inverters extracted from manufacturer PDFs
-- supplied by user (OneDrive / UV Energy Consultants 04.EQUIPMENT/INVERTER).
-- Every numerical value below is reproducible against the published
-- Sungrow datasheet whose URL is in source_ref.
--
-- Catalog-verified.  Models added here are the >100 kW commercial /
-- utility-scale string inverters not present in CEC SAM (which is
-- limited to US-sold inverters).
--
-- Generated 2026-05-21 from user-uploaded PDFs.

INSERT INTO equipment_items (library_id, category, type_code, manufacturer, model, display_name, params_json, source_ref, verified, verified_at, verified_by, created_at, updated_at) VALUES

-- SG320HX-20 — Multi-MPPT String Inverter for 1500 Vdc System
-- Source: SG305HX_SG320HX-20_SG350HX-20 User Manual §9.1 + standalone DS_SG320HX-20.pdf
(1, 'pv_inv', 'SG320HX-20', 'Sungrow', 'SG320HX-20',
 'Sungrow SG320HX-20 (320 kVA, 800 V, 1500 Vdc)',
 '{"Sn_kVA":320,"Pn_kW":300,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_pv_min_V":500,"V_pv_nom_V":1080,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"I_pv_max_A":75,"Isc_pv_max_A":125,"V_ac_min_V":640,"V_ac_max_V":920,"freq_Hz":50,"eff_max_pct":99.02,"eff_euro_pct":98.8,"weight_kg":106,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/3564/string-inverter-sg350hx-us',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG350HX-20 — same family as SG320HX-20, higher AC rating
(1, 'pv_inv', 'SG350HX-20', 'Sungrow', 'SG350HX-20',
 'Sungrow SG350HX-20 (352 kVA @30 C / 320 kVA @40 C, 800 V, 1500 Vdc)',
 '{"Sn_kVA":352,"Pn_kW":320,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_pv_min_V":500,"V_pv_nom_V":1080,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"I_pv_max_A":75,"Isc_pv_max_A":125,"V_ac_min_V":640,"V_ac_max_V":920,"freq_Hz":50,"eff_max_pct":99.02,"eff_euro_pct":98.8,"weight_kg":106,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/3564/string-inverter-sg350hx-us',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG305HX — same 1500 Vdc family, lower AC rating
(1, 'pv_inv', 'SG305HX', 'Sungrow', 'SG305HX',
 'Sungrow SG305HX (305 kVA, 800 V, 1500 Vdc)',
 '{"Sn_kVA":305,"Pn_kW":275,"Un_V":800,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_pv_min_V":500,"V_pv_nom_V":1080,"V_mppt_min_V":500,"V_mppt_max_V":1500,"n_mppt":6,"I_pv_max_A":75,"Isc_pv_max_A":125,"V_ac_min_V":640,"V_ac_max_V":920,"freq_Hz":50,"eff_max_pct":99.02,"eff_euro_pct":98.8,"weight_kg":106,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/3564/string-inverter-sg350hx-us',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG125CX-P2 — Multi-MPPT String Inverter for 1000 Vdc System
-- Source: SG125_110_75CX-P2 User Manual §10.1
(1, 'pv_inv', 'SG125CX-P2', 'Sungrow', 'SG125CX-P2',
 'Sungrow SG125CX-P2 (125 kVA, 400 V, 1000 Vdc, 12 MPPT)',
 '{"Sn_kVA":125,"Pn_kW":125,"Un_V":400,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1100,"V_pv_min_V":180,"V_pv_nom_V":600,"V_mppt_min_V":180,"V_mppt_max_V":1000,"n_mppt":12,"I_pv_max_A":30,"Isc_pv_max_A":40,"V_ac_min_V":320,"V_ac_max_V":480,"freq_Hz":50,"eff_max_pct":98.5,"eff_euro_pct":98.3,"weight_kg":95,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/sg125cx-p2',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG110CX-P2 — 1000 Vdc, 12 MPPT (380 V LATAM variant)
(1, 'pv_inv', 'SG110CX-P2', 'Sungrow', 'SG110CX-P2',
 'Sungrow SG110CX-P2 (110 kVA, 380 V, 1000 Vdc, 12 MPPT)',
 '{"Sn_kVA":110,"Pn_kW":110,"Un_V":380,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1100,"V_pv_min_V":180,"V_pv_nom_V":600,"V_mppt_min_V":180,"V_mppt_max_V":1000,"n_mppt":12,"I_pv_max_A":30,"Isc_pv_max_A":40,"V_ac_min_V":304,"V_ac_max_V":456,"freq_Hz":50,"eff_max_pct":98.6,"eff_euro_pct":98.3,"weight_kg":87,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/sg110cx-p2',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG75CX-P2 — 1000 Vdc, 8 MPPT
(1, 'pv_inv', 'SG75CX-P2', 'Sungrow', 'SG75CX-P2',
 'Sungrow SG75CX-P2 (75 kVA, 400 V, 1000 Vdc, 8 MPPT)',
 '{"Sn_kVA":75,"Pn_kW":75,"Un_V":400,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1100,"V_pv_min_V":180,"V_pv_nom_V":600,"V_mppt_min_V":180,"V_mppt_max_V":1000,"n_mppt":8,"I_pv_max_A":30,"Isc_pv_max_A":40,"V_ac_min_V":320,"V_ac_max_V":480,"freq_Hz":50,"eff_max_pct":98.5,"eff_euro_pct":98.3,"weight_kg":82,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/sg75cx-p2',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- SG110CX Premium — earlier-generation 1000 Vdc, 9 MPPT
(1, 'pv_inv', 'SG110CX', 'Sungrow', 'SG110CX Premium',
 'Sungrow SG110CX Premium (110 kVA @45 C, 400 V, 1000 Vdc, 9 MPPT)',
 '{"Sn_kVA":110,"Pn_kW":100,"Un_V":400,"cosphi_min":0.8,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1100,"V_pv_min_V":200,"V_pv_nom_V":585,"V_mppt_min_V":200,"V_mppt_max_V":1000,"n_mppt":9,"I_pv_max_A":26,"Isc_pv_max_A":40,"V_ac_min_V":320,"V_ac_max_V":460,"freq_Hz":50,"eff_max_pct":98.7,"eff_euro_pct":98.5,"weight_kg":89,"IP_rating":"IP66","T_min_C":-30,"T_max_C":60}',
 'https://en.sungrowpower.com/productDetail/sg110cx',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now'));
