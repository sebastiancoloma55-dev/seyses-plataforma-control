import unittest

import pandas as pd

from sesyes_imports import normalize_rut, reconcile_sources, worker_payloads


class ReconciliationTests(unittest.TestCase):
    def test_normalize_rut_variants(self):
        self.assertEqual(normalize_rut("12.345.678-5"), "12345678-5")
        self.assertEqual(normalize_rut("123456785"), "12345678-5")
        self.assertEqual(normalize_rut("12345678.0"), "12345678-0")
        self.assertEqual(normalize_rut(None), "")

    def test_reconcile_detects_missing_access_and_extra_access(self):
        payroll = pd.DataFrame({
            "RUT": ["12.345.678-5", "11.111.111-1"],
            "Nombre": ["Ana Pérez", "Luis Soto"],
            "Sucursal": ["Centro", "Norte"],
        })
        access = pd.DataFrame({
            "RUN": ["12.345.678-5", "22.222.222-2"],
            "Nombre completo": ["Ana Pérez", "Persona Externa"],
            "Sucursal": ["Centro", "Sur"],
        })
        result, payroll_info, access_info = reconcile_sources(payroll, access)
        categories = dict(zip(result["rut"], result["categoria"]))
        self.assertEqual(categories["12345678-5"], "")
        self.assertEqual(categories["11111111-1"], "Sin acceso")
        self.assertEqual(categories["22222222-2"], "Fuera de nómina")
        self.assertEqual(payroll_info["valid_unique_ruts"], 2)
        self.assertEqual(access_info["valid_unique_ruts"], 2)

    def test_worker_payload_has_process_reference_and_no_passwords(self):
        payroll = pd.DataFrame({"RUT": ["12.345.678-5"], "Nombre": ["Ana Pérez"]})
        access = pd.DataFrame({"RUT": ["12.345.678-5"], "Nombre": ["Ana Pérez"]})
        result, _, _ = reconcile_sources(payroll, access)
        payload = worker_payloads(result, "process-123")[0]
        self.assertEqual(payload["source_process_id"], "process-123")
        self.assertEqual(payload["rut"], "12345678-5")
        self.assertNotIn("password", payload)


if __name__ == "__main__":
    unittest.main()
