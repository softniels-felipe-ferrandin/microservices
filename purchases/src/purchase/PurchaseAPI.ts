import { IPurchaseAPI } from "@/purchase/IPurchaseAPI"
import { CompletePurchaseDTO, ProductIDs, PurchaseCreateDTO } from "@/purchase/PurchaseDTO"
import { IPurchaseRepository } from "@/purchase/IPurchaseRepository"
import { IPurchaseDetailAPI } from "@/purchaseDetail/IPurchaseDetailAPI"
import { IProductAPI } from "@/product/IProductAPI"
import BusinessError from "@/framework/errors/BusinessError"
import { ICustomerAPI } from "@/customer/ICustomerAPI"
import EntityNotFound from "@/framework/errors/EntityNotFound"
import { IKafkaProducerMessage } from "@/framework/providers/kafka/IKafkaProducerMessage"
import { TopicsConstants } from "@/framework/providers/kafka/TopicsConstants"
import { OrderDTO } from "@/framework/providers/kafka/KafkaDTO"

class PurchaseAPI implements IPurchaseAPI {

    constructor(
        private mIPurchaseRepository: IPurchaseRepository,
        private mIProductAPI: IProductAPI,
        private mIPurchaseDetailAPI: IPurchaseDetailAPI,
        private mICustomerAPI: ICustomerAPI,
        private mIKafkaProducerMessage: IKafkaProducerMessage
    ) {
    }

    async createPurchase({ purchase, products }: PurchaseCreateDTO): Promise<void> {
        //TODO VALIDATE
        //TODO BUSCAR PRODUTOS
        const lPurchaseDTO = await this.mIPurchaseRepository.createPurchase(purchase, products)
        await this.insertProductInPurchase(lPurchaseDTO.id_purchase, products.map(iProduct => <ProductIDs>{ id_product: iProduct.id_product }))
    }

    async deleteProductPurchaseById(aIDPurchase: number, aIDPurchaseDetail: number): Promise<void> {
        //TODO VALIDATE
        await this.mIPurchaseDetailAPI.deleteProduct(aIDPurchaseDetail)
        const lProductsDTO = await this.mIPurchaseDetailAPI.searchProducts(aIDPurchase)
        await this.mIPurchaseRepository.recalculatePurchaseValue(aIDPurchase, lProductsDTO)
    }

    async deletePurchaseById(aIdPurchase: number): Promise<void> {
        if ([null, undefined, '', 0, NaN, {}].includes(aIdPurchase)) throw new BusinessError("Informe um ID de compra valido")
        await this.mIPurchaseRepository.deletePurchaseById(aIdPurchase)
    }

    async getPurchaseById(aIdPurchase: number): Promise<CompletePurchaseDTO> {
        if ([null, undefined, '', 0, NaN, {}].includes(aIdPurchase)) throw new BusinessError("Informe um ID de compra valido")
        const lCompletePurchaseDTO = await this.mIPurchaseRepository.getPurchaseById(aIdPurchase)
        lCompletePurchaseDTO.products = await this.mIPurchaseDetailAPI.searchProducts(aIdPurchase)
        lCompletePurchaseDTO.customer = await this.mICustomerAPI.getCompleteCustomer(lCompletePurchaseDTO.id_customer)
        return lCompletePurchaseDTO
    }

    async insertProductInPurchase(aIDPurchase: number, aIdsProducts: ProductIDs[]): Promise<void> {
        if ([null, undefined, '', 0, NaN, {}].includes(aIDPurchase)) throw new BusinessError("Informe um ID de compra valido")
        for (const iProduct of aIdsProducts) {
            if (!await this.mIProductAPI.getProductById(iProduct.id_product)) throw new EntityNotFound(`Produto nao encontrado com ID ${iProduct.id_product}`)
            await this.mIPurchaseDetailAPI.insertProductInPurchase(aIDPurchase, iProduct.id_product)
        }
        const lProductsDTO = await this.mIProductAPI.getProductsByIds(aIdsProducts)
        await this.mIPurchaseRepository.recalculatePurchaseValue(aIDPurchase, lProductsDTO)
    }

    async finalizePurchase(aIdPurchase: number): Promise<void> {
        if ([null, undefined, '', 0, NaN, {}].includes(aIdPurchase)) throw new BusinessError("Informe um ID de compra valido")
        await this.mIPurchaseRepository.finalizePurchase(aIdPurchase)
        const lPurchaseDTO = await this.getPurchaseById(aIdPurchase)
        //TODO VERIFICAR O QUE FAZER QUANDO ISSO ESTIVER EM UMA TRANSACAO

        this.mIKafkaProducerMessage.sendMessage<OrderDTO>(TopicsConstants.KAFKA_TESTE, {
            id_customer: lPurchaseDTO.id_customer,
            customer_name: lPurchaseDTO.customer?.name ?? "",
            purchase_id: lPurchaseDTO.id_purchase,
            address_id: lPurchaseDTO.customer?.address_id ?? 0
        })
    }

}

export { PurchaseAPI }