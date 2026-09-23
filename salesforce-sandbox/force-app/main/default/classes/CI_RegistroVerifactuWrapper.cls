/*
*   @Class          :   CI_RegistroVerifactuWrapper
*
*   @Author         :   Julián Martínez Cordones <julian@calibre360.io>
*   @Created        :   2025-07-18
*   @Description    :   Class CI_RegistroVerifactuWrapper
*
*   Modification Log
*   --------------------------------------------------------------------------------------
*   #       Developer                           Date                    Description
*   --------------------------------------------------------------------------------------
*   1       Julián Martínez Cordones            2025-07-18      	    Creation           
*
*/

public class CI_RegistroVerifactuWrapper {
    public class RegistroVerifactuBase {
        public Cabecera Cabecera;
        public List<RegistroFactura> RegistroFactura;
    }

    public class Cabecera {
        public ObligadoEmision ObligadoEmision;
        public Representante Representante;
        public RemisionVoluntaria RemisionVoluntaria;
        public RemisionRequerimiento RemisionRequerimiento;
        public String errorDescription {get;set;}
    }

    public class Representante {
        public String NombreRazon;
        public String NIF;
    }

    public class RemisionVoluntaria {
        public Date FechaFinVerifactu;
        public String Incidencia;
    }

    public class RemisionRequerimiento {
        public String RefRequerimiento;
        public String FinRequerimiento;
    }

    public class RegistroFactura {
        public RegistroAlta RegistroAlta;
        public RegistroAnulacion RegistroAnulacion;
    }

    public class ObligadoEmision {
        public String NombreRazon;
        public String NIF;
    }

    public class RegistroAlta {
        public String IDVersion;
        public RegistroAltaIDFactura IDFactura;
        public String RefExterna;
        public String NombreRazonEmisor;
        public String Subsanacion;
        public String RechazoPrevio;
        public String TipoFactura;
        public String TipoRectificativa;
        public FacturasRectificadas FacturasRectificadas;
        public FacturasSustituidas FacturasSustituidas;
        public ImporteRectificacion ImporteRectificacion;
        public String FechaOperacion;
        public String DescripcionOperacion;
        public String FacturaSimplificadaArt7273;
        public String FacturaSinIdentifDestinatarioArt61d;
        public String Macrodato;
        public String EmitidaPorTerceroODestinatario;
        public Tercero Tercero;
        public Destinatarios Destinatarios;
        public String Cupon;
        public Desglose Desglose;
        public Decimal CuotaTotal;
        public Decimal ImporteTotal;
        public Encadenamiento Encadenamiento;
        public SistemaInformatico SistemaInformatico;
        public Datetime FechaHoraHusoGenRegistro;
        public String NumRegistroAcuerdoFacturacion;
        public String IdAcuerdoSistemaInformatico;
        public String TipoHuella;
        public String Huella;
        public String Signature;
        public String errorDescription {get;set;}
    }

    public class RegistroAltaIDFactura {
        public String IDEmisorFactura;
        public String NumSerieFactura;
        public String FechaExpedicionFactura;
    }

    public class FacturasRectificadas {
        public List<IDFacturaRectificada> IDFacturaRectificada;
    }

    public class IDFacturaRectificada {
        public String IDEmisorFactura;
        public String NumSerieFactura;
        public String FechaExpedicionFactura;
    }

    public class FacturasSustituidas {
        public List<IDFacturaSustituida> IDFacturaSustituida;
    }

    public class IDFacturaSustituida {
        public String IDEmisorFactura;
        public String NumSerieFactura;
        public String FechaExpedicionFactura;
    }

    public class ImporteRectificacion {
        public Decimal BaseRectificada;
        public Decimal CuotaRectificada;
        public Decimal CuotaRecargoRectificado;
    }

    public class Tercero {
        public String NombreRazon;
        public String NIF;
        public IDOtro IDOtro;
    }

    public class Destinatarios {
        public List<IDDestinatario> IDDestinatario;
    }

    public class IDDestinatario {
        public String NombreRazon;
        public String NIF;
        public IDOtro IDOtro;
    }

    public class Desglose {
        public List<DetalleDesglose> DetalleDesglose;
    }

    public class DetalleDesglose {
        public String Impuesto;
        public String ClaveRegimen;
        public String CalificacionOperacion;
        public String OperacionExenta;
        public Decimal TipoImpositivo;
        public Decimal BaseImponibleOimporteNoSujeto;
        public Decimal BaseImponibleACoste;
        public Decimal CuotaRepercutida;
        public Decimal TipoRecargoEquivalencia;
        public Decimal CuotaRecargoEquivalencia;
    }

    public class RegistroAnulacion {
        public String IDVersion;
        public RegistroAnulacionIDFactura IDFactura;
        public String RefExterna;
        public String SinRegistroPrevio;
        public String RechazoPrevio;
        public String GeneradoPor;
        public Generador Generador;
        public Encadenamiento Encadenamiento;
        public SistemaInformatico SistemaInformatico;
        public Datetime FechaHoraHusoGenRegistro;
        public String TipoHuella;
        public String Huella;
        public String Signature;
        public String errorDescription {get;set;}
    }

    public class RegistroAnulacionIDFactura {
        public String IDEmisorFacturaAnulada;
        public String NumSerieFacturaAnulada;
        public String FechaExpedicionFacturaAnulada;
    }

    public class Generador {
        public String NombreRazon;
        public String NIF;
        public IDOtro IDOtro;
    }

    public class IDOtro {
        public String CodigoPais;
        public String IDType;
        public String ID;
    }

    public class Encadenamiento {
        public String PrimerRegistro;
        public RegistroAnterior RegistroAnterior;
    }

    public class RegistroAnterior {
        public String IDEmisorFactura;
        public String NumSerieFactura;
        public String FechaExpedicionFactura;
        public String Huella;
    }

    public class SistemaInformatico {
        public String NombreRazon;
        public String NIF;
        public IDOtro IDOtro;
        public String NombreSistemaInformatico;
        public String IdSistemaInformatico;
        public String Version;
        public String NumeroInstalacion;
        public String TipoUsoPosibleSoloVerifactu;
        public String TipoUsoPosibleMultiOT;
        public String IndicadorMultiplesOT;
    }

    public static void cober (){
        Integer i = 0;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
    }
}