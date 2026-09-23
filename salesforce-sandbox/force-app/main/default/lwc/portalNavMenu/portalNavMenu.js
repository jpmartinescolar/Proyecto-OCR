import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getMenuItems from '@salesforce/apex/PortalMenuController.getMenuItems';

/**
 * Renderiza el menú del área privada a partir de Portal_Menu_Item__mdt.
 *
 * Niveles que pinta:
 *  1. Opciones de primer nivel: directas (navegan a una página) o con submenú (Is_Parent__c,
 *     despliegan al pinchar). Un registro de primer nivel con Es_Cabecera__c se pinta como
 *     cabecera de sección con sus opciones debajo.
 *  2. Dentro de un submenú: opciones directas (como siempre) y/o cabeceras de sección
 *     (Es_Cabecera__c): título en mayúsculas, sin click, siempre abierto.
 *  3. Dentro de una cabecera: sus opciones, con icono si lo tienen.
 *
 * El orden lo marca Menu_Order__c dentro de cada padre, mezclando cabeceras y opciones
 * directas. Una cabecera sin opciones no se pinta; una cabecera dentro de otra se ignora.
 *
 * @author JCL - BEOC9 (original); cabeceras de sección añadidas el 2026-09-05
 */
export default class PortalNavMenu extends NavigationMixin(LightningElement) {
    @track menuItems = [];

    currentPageApiName;
    rawMenuData = [];

    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        if (pageRef && pageRef.attributes) {
            this.currentPageApiName = pageRef.attributes.name;
        }
        this.refreshDerivedState();
    }

    @wire(getMenuItems)
    wiredMenuItems({ data, error }) {
        if (data) {
            this.rawMenuData = data;
            this.refreshDerivedState();
        } else if (error) {
            this.rawMenuData = [];
            this.menuItems = [];
            // eslint-disable-next-line no-console
            console.error('Error al cargar el menú del área privada', error);
        }
    }

    // Reconstruye el modelo visual (activo/expandido) preservando qué padres
    // el usuario ha abierto manualmente
    refreshDerivedState() {
        if (!this.rawMenuData || !this.rawMenuData.length) {
            return;
        }
        const expandedByKey = new Map(
            (this.menuItems || []).map((item) => [item.key, item.isExpanded])
        );
        this.menuItems = this.rawMenuData
            .map((item, index) =>
                item.isSection
                    ? this.buildSection(item, `menu-${index}`)
                    : this.buildItem(item, `menu-${index}`, expandedByKey)
            )
            .filter((item) => !item.isSection || item.children.length > 0);
    }

    // Opción de primer nivel (directa o con submenú). Sus hijos pueden ser opciones
    // directas o cabeceras de sección; las cabeceras vacías se descartan.
    buildItem(item, key, expandedByKey) {
        const children = (item.children || [])
            .map((child, childIndex) =>
                child.isSection
                    ? this.buildSection(child, `${key}-${childIndex}`)
                    : this.buildLeaf(child, `${key}-${childIndex}`)
            )
            .filter((child) => !child.isSection || child.children.length > 0);
        const hasActiveChild = children.some((child) => child.isActive);
        const isSelfActive = Boolean(item.targetPage) && item.targetPage === this.currentPageApiName;
        const isActive = isSelfActive || hasActiveChild;
        const previouslyExpanded = expandedByKey.get(key);
        const isExpanded = previouslyExpanded !== undefined ? previouslyExpanded : hasActiveChild;

        return {
            key,
            isSection: false,
            label: item.label,
            iconName: item.iconName,
            targetPage: item.targetPage,
            isParent: item.isParent,
            isActive,
            isExpanded,
            children,
            itemClass: isActive ? 'nav-item nav-item_active' : 'nav-item',
            chevronClass: isExpanded ? 'chevron chevron_expanded' : 'chevron'
        };
    }

    // Cabecera de sección: título sin click y sus opciones (una cabecera anidada en otra se ignora)
    buildSection(section, key) {
        const leaves = (section.children || [])
            .filter((child) => !child.isSection)
            .map((leaf, leafIndex) => this.buildLeaf(leaf, `${key}-${leafIndex}`));
        return {
            key,
            isSection: true,
            label: section.label,
            children: leaves,
            isActive: leaves.some((leaf) => leaf.isActive)
        };
    }

    // Opción que navega, dentro de un submenú o de una cabecera. Con icono si lo tiene.
    buildLeaf(child, key) {
        const isActive = Boolean(child.targetPage) && child.targetPage === this.currentPageApiName;
        const hasIcon = Boolean(child.iconName);
        let itemClass = 'nav-item nav-item_sub';
        if (hasIcon) {
            itemClass += ' nav-item_sub_icon';
        }
        if (isActive) {
            itemClass += ' nav-item_active';
        }
        return {
            key,
            isSection: false,
            label: child.label,
            iconName: child.iconName,
            hasIcon,
            targetPage: child.targetPage,
            isActive,
            itemClass
        };
    }

    handleItemClick(event) {
        const key = event.currentTarget.dataset.key;
        const item = this.menuItems.find((menuItem) => menuItem.key === key);
        if (!item) {
            return;
        }
        if (item.isParent) {
            this.toggleExpanded(key);
        } else {
            this.navigateToPage(item.targetPage);
        }
    }

    handleSubItemClick(event) {
        const targetPage = event.currentTarget.dataset.targetPage;
        this.navigateToPage(targetPage);
    }

    // Acordeón: al abrir un menú del primer nivel se cierran los demás que estuvieran
    // desplegados; al pinchar el que ya está abierto, se cierra
    toggleExpanded(key) {
        this.menuItems = this.menuItems.map((item) => {
            if (item.isSection || !item.isParent) {
                return item;
            }
            const isExpanded = item.key === key ? !item.isExpanded : false;
            if (isExpanded === item.isExpanded) {
                return item;
            }
            return {
                ...item,
                isExpanded,
                chevronClass: isExpanded ? 'chevron chevron_expanded' : 'chevron'
            };
        });
    }

    navigateToPage(pageApiName) {
        if (!pageApiName) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: {
                name: pageApiName
            }
        });
    }
}