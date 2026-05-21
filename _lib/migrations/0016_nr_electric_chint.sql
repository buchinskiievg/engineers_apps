-- 0016 — NR Electric PCS-9567 MV skid + CHINT KYN28A MV switchgear
--
-- NR Electric specs sourced from nrec.com product pages
--   www.nrec.com/en/index.php/product/productInfo/{652,657,367}.html
--   www.nrec.com/en/web/upload/2025/08/15/PCS-9567MV-3500-V1.3.pdf
-- CHINT specs sourced from
--   www.chintglobal.com/global/en/products/.../kyn28a-12(z)(630~5000).html
--   www.chintglobal.com/global/en/products/.../kyn28a-24(z)(630~3150).html
--
-- Catalog-verified (manufacturer's published product page / datasheet).

INSERT INTO equipment_items (library_id, category, type_code, manufacturer, model, display_name, params_json, source_ref, verified, verified_at, verified_by, created_at, updated_at) VALUES

-- ── NR Electric PCS-9567MV MV skid family (inverter + step-up TX + MV switchgear)
(1, 'pv_st', 'PCS-9567MV-2500', 'NR Electric', 'PCS-9567MV-2500',
 'NR Electric PCS-9567MV-2500 MV Skid (2500 kVA / 2750 kVA max)',
 '{"Sn_MVA":2.5,"Sn_kVA_peak":2750,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":6.5,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/index.php/product/productList/39.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'PCS-9567MV-3150', 'NR Electric', 'PCS-9567MV-3150',
 'NR Electric PCS-9567MV-3150 MV Skid (3150 kVA / 3465 kVA max)',
 '{"Sn_MVA":3.15,"Sn_kVA_peak":3465,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":6.5,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/index.php/product/productList/39.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'PCS-9567MV-3500', 'NR Electric', 'PCS-9567MV-3500',
 'NR Electric PCS-9567MV-3500 MV Skid (3450 kVA / 3795 kVA max)',
 '{"Sn_MVA":3.45,"Sn_kVA_peak":3795,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":7.0,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/web/upload/2025/08/15/17552441052166np0ox.pdf',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'PCS-9567MV-5000', 'NR Electric', 'PCS-9567MV-5000',
 'NR Electric PCS-9567MV-5000 MV Skid (5000 kVA / 5500 kVA max)',
 '{"Sn_MVA":5.0,"Sn_kVA_peak":5500,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":7.5,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/index.php/product/productList/39.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'PCS-9567MV-7000', 'NR Electric', 'PCS-9567MV-7000',
 'NR Electric PCS-9567MV-7000 MV Skid (7000 kVA)',
 '{"Sn_MVA":7.0,"Sn_kVA_peak":7700,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":8.0,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/index.php/product/productInfo/652.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_st', 'PCS-9567MV-10000', 'NR Electric', 'PCS-9567MV-10000',
 'NR Electric PCS-9567MV-10000 MV Skid (10 MVA)',
 '{"Sn_MVA":10.0,"Sn_kVA_peak":11000,"Un_LV_V":690,"Un_MV_kV":35,"ukr_pct":8.5,"vg":"Dyn11","f_Hz":50,"cosphi_min":0.95,"I_sc_pu":1.10}',
 'https://www.nrec.com/en/index.php/product/productInfo/657.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- ── NR Electric PCS-9567TU individual inverter units (sub-components of MV skids)
(1, 'pv_inv', 'PCS-9567TU-1750', 'NR Electric', 'PCS-9567TU-1750',
 'NR Electric PCS-9567TU-1750 (1750 kW, 1900 kVA max, 690 V)',
 '{"Sn_kVA":1900,"Pn_kW":1750,"Un_V":690,"cosphi_min":0.9,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":875,"V_mppt_max_V":1500}',
 'https://www.nrec.com/en/index.php/product/productInfo/367.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'pv_inv', 'PCS-9567TU-1375', 'NR Electric', 'PCS-9567TU-1375',
 'NR Electric PCS-9567TU-1375 (1375 kW, 1513 kVA max, 550 V)',
 '{"Sn_kVA":1513,"Pn_kW":1375,"Un_V":550,"cosphi_min":0.9,"I_sc_pu":1.10,"k_q_pu":1.0,"LVRT_pct":20,"V_pv_max_V":1500,"V_mppt_min_V":700,"V_mppt_max_V":1500}',
 'https://www.nrec.com/en/index.php/product/productInfo/367.html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

-- ── CHINT KYN28A MV air-insulated switchgear (24 kV class — generic frames)
-- The KYN28A-12(Z) is a 3.6-12 kV / 630-5000 A / 16-50 kA MV switchgear family;
-- KYN28A-24(Z) covers 24 kV / 630-3150 A.
-- IEC 62271-200 type-tested.  Listed here are the standard frame ratings.
(1, 'cb_mv', 'KYN28A-12-630-25', 'CHINT', 'KYN28A-12 / 630 A / 25 kA',
 'CHINT KYN28A-12 metalclad MV switchgear (12 kV, 630 A, 25 kA)',
 '{"Un_kV":12,"In_A":630,"Icu_kA":25,"Isc_pk_kA":63,"Iw_kA_3s":25,"BIL_kV":75,"Ud_kV":42,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-12(z)(630~5000).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-12-1250-31.5', 'CHINT', 'KYN28A-12 / 1250 A / 31.5 kA',
 'CHINT KYN28A-12 metalclad MV switchgear (12 kV, 1250 A, 31.5 kA)',
 '{"Un_kV":12,"In_A":1250,"Icu_kA":31.5,"Isc_pk_kA":80,"Iw_kA_3s":31.5,"BIL_kV":75,"Ud_kV":42,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-12(z)(630~5000).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-12-2500-40', 'CHINT', 'KYN28A-12 / 2500 A / 40 kA',
 'CHINT KYN28A-12 metalclad MV switchgear (12 kV, 2500 A, 40 kA)',
 '{"Un_kV":12,"In_A":2500,"Icu_kA":40,"Isc_pk_kA":100,"Iw_kA_3s":40,"BIL_kV":75,"Ud_kV":42,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-12(z)(630~5000).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-12-3150-40', 'CHINT', 'KYN28A-12 / 3150 A / 40 kA',
 'CHINT KYN28A-12 metalclad MV switchgear (12 kV, 3150 A, 40 kA)',
 '{"Un_kV":12,"In_A":3150,"Icu_kA":40,"Isc_pk_kA":100,"Iw_kA_3s":40,"BIL_kV":75,"Ud_kV":42,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-12(z)(630~5000).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-12-4000-50', 'CHINT', 'KYN28A-12 / 4000 A / 50 kA',
 'CHINT KYN28A-12 metalclad MV switchgear (12 kV, 4000 A, 50 kA)',
 '{"Un_kV":12,"In_A":4000,"Icu_kA":50,"Isc_pk_kA":125,"Iw_kA_3s":50,"BIL_kV":75,"Ud_kV":42,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-12(z)(630~5000).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-24-630-25', 'CHINT', 'KYN28A-24 / 630 A / 25 kA',
 'CHINT KYN28A-24 metalclad MV switchgear (24 kV, 630 A, 25 kA)',
 '{"Un_kV":24,"In_A":630,"Icu_kA":25,"Isc_pk_kA":63,"Iw_kA_3s":25,"BIL_kV":125,"Ud_kV":50,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-24(z)(630~3150).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-24-1250-25', 'CHINT', 'KYN28A-24 / 1250 A / 25 kA',
 'CHINT KYN28A-24 metalclad MV switchgear (24 kV, 1250 A, 25 kA)',
 '{"Un_kV":24,"In_A":1250,"Icu_kA":25,"Isc_pk_kA":63,"Iw_kA_3s":25,"BIL_kV":125,"Ud_kV":50,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-24(z)(630~3150).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-24-2500-31.5', 'CHINT', 'KYN28A-24 / 2500 A / 31.5 kA',
 'CHINT KYN28A-24 metalclad MV switchgear (24 kV, 2500 A, 31.5 kA)',
 '{"Un_kV":24,"In_A":2500,"Icu_kA":31.5,"Isc_pk_kA":80,"Iw_kA_3s":31.5,"BIL_kV":125,"Ud_kV":50,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-24(z)(630~3150).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now')),

(1, 'cb_mv', 'KYN28A-24-3150-31.5', 'CHINT', 'KYN28A-24 / 3150 A / 31.5 kA',
 'CHINT KYN28A-24 metalclad MV switchgear (24 kV, 3150 A, 31.5 kA)',
 '{"Un_kV":24,"In_A":3150,"Icu_kA":31.5,"Isc_pk_kA":80,"Iw_kA_3s":31.5,"BIL_kV":125,"Ud_kV":50,"f_Hz":50,"poles":3,"IP_rating":"IP4X","standard":"IEC 62271-200"}',
 'https://www.chintglobal.com/global/en/products/power-transmission-and-distribution/distribution/kyn28a-24(z)(630~3150).html',
 'catalog', strftime('%s','now'), NULL, strftime('%s','now'), strftime('%s','now'));
