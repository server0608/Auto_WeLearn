"""
账号管理视图
主界面核心组件 - 显示账号列表、状态和操作按钮
"""
from pathlib import Path

from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton,
    QTableWidget, QTableWidgetItem, QLabel, QFileDialog, QMessageBox,
    QLineEdit, QDialog, QHeaderView, QAbstractItemView, QFrame
)
from core.account_manager import AccountManager, Account


DESKTOP_ACCOUNT_FILE = Path(__file__).resolve().parents[1] / "data" / "desktop_accounts.json"


class AddAccountDialog(QDialog):
    """添加账号对话框"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("添加账号")
        self.setModal(True)
        self.setMinimumWidth(300)
        self.init_ui()
    
    def init_ui(self):
        layout = QVBoxLayout(self)
        
        # 用户名
        self.username_input = QLineEdit()
        self.username_input.setPlaceholderText("用户名")
        layout.addWidget(QLabel("用户名:"))
        layout.addWidget(self.username_input)
        
        # 密码
        self.password_input = QLineEdit()
        self.password_input.setPlaceholderText("密码")
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addWidget(QLabel("密码:"))
        layout.addWidget(self.password_input)
        
        # 昵称（可选）
        self.nickname_input = QLineEdit()
        self.nickname_input.setPlaceholderText("昵称（可选，方便识别）")
        layout.addWidget(QLabel("昵称:"))
        layout.addWidget(self.nickname_input)
        
        # 按钮
        button_layout = QHBoxLayout()
        ok_btn = QPushButton("确定")
        cancel_btn = QPushButton("取消")
        ok_btn.clicked.connect(self.accept)
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(ok_btn)
        button_layout.addWidget(cancel_btn)
        layout.addLayout(button_layout)
    
    def get_values(self):
        return (
            self.username_input.text().strip(),
            self.password_input.text().strip(),
            self.nickname_input.text().strip()
        )


class AccountView(QWidget):
    """
    账号管理视图
    主界面的核心组件，显示账号列表并提供操作
    """
    
    # 信号：请求打开账号详情
    open_detail_requested = pyqtSignal(Account)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.account_manager = AccountManager()
        self.storage_path = DESKTOP_ACCOUNT_FILE
        self.init_ui()
        self.load_accounts()
        self.refresh_table()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(16)

        # ========== 顶部信息区 ==========
        hero_panel = QFrame()
        hero_panel.setObjectName("HeroPanel")
        hero_layout = QHBoxLayout(hero_panel)
        hero_layout.setContentsMargins(24, 22, 24, 22)

        title_layout = QVBoxLayout()
        eyebrow = QLabel("DESKTOP CONTROL")
        eyebrow.setObjectName("HeroEyebrow")
        title_layout.addWidget(eyebrow)

        title_label = QLabel("WeLearn 多账号控制台")
        title_label.setObjectName("HeroTitle")
        title_layout.addWidget(title_label)

        subtitle = QLabel("集中管理账号、筛选目标课程，并在单账号窗口内执行自动化任务。")
        subtitle.setObjectName("HeroSubtitle")
        subtitle.setWordWrap(True)
        title_layout.addWidget(subtitle)
        hero_layout.addLayout(title_layout, 1)

        search_layout = QVBoxLayout()
        search_tip = QLabel("快速筛选")
        search_tip.setObjectName("SectionLabel")
        search_layout.addWidget(search_tip)
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("按用户名、昵称或目标课程搜索")
        self.search_input.setClearButtonEnabled(True)
        self.search_input.textChanged.connect(self.refresh_table)
        search_layout.addWidget(self.search_input)
        hero_layout.addLayout(search_layout, 1)
        layout.addWidget(hero_panel)

        # ========== 统计卡片 ==========
        metrics_layout = QHBoxLayout()
        metrics_layout.setSpacing(12)
        self.total_card = self.create_metric_card("账号总数", "0")
        self.running_card = self.create_metric_card("运行中", "0")
        self.completed_card = self.create_metric_card("已完成", "0")
        metrics_layout.addWidget(self.total_card)
        metrics_layout.addWidget(self.running_card)
        metrics_layout.addWidget(self.completed_card)
        layout.addLayout(metrics_layout)

        # ========== 工具栏 ==========
        toolbar_panel = QFrame()
        toolbar_panel.setObjectName("ToolbarPanel")
        toolbar_layout = QHBoxLayout(toolbar_panel)
        toolbar_layout.setContentsMargins(18, 16, 18, 16)

        self.add_btn = QPushButton("添加账号")
        self.delete_btn = QPushButton("删除选中")

        self.add_btn.clicked.connect(self.add_account)
        self.delete_btn.clicked.connect(self.delete_selected)

        toolbar_layout.addWidget(self.add_btn)
        toolbar_layout.addWidget(self.delete_btn)
        toolbar_layout.addStretch()
        layout.addWidget(toolbar_panel)

        # ========== 账号表格 ==========
        table_panel = QFrame()
        table_panel.setObjectName("TablePanel")
        table_layout = QVBoxLayout(table_panel)
        table_layout.setContentsMargins(18, 18, 18, 18)
        table_layout.setSpacing(12)

        table_header_layout = QHBoxLayout()
        table_title = QLabel("账号列表")
        table_title.setObjectName("SectionTitle")
        table_header_layout.addWidget(table_title)
        table_header_layout.addStretch()
        self.table_hint_label = QLabel("双击或点击“管理”进入账号详情")
        self.table_hint_label.setObjectName("SectionHint")
        table_header_layout.addWidget(self.table_hint_label)
        table_layout.addLayout(table_header_layout)

        self.account_table = QTableWidget()
        self.account_table.setColumnCount(6)
        self.account_table.setHorizontalHeaderLabels([
            '用户名', '昵称', '状态', '目标课程', '进度', '操作'
        ])
        
        # 设置表格属性
        header = self.account_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        
        self.account_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.account_table.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self.account_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.account_table.setAlternatingRowColors(True)
        self.account_table.setShowGrid(False)
        self.account_table.verticalHeader().setVisible(False)
        self.account_table.verticalHeader().setDefaultSectionSize(46)
        
        # 双击打开详情
        self.account_table.doubleClicked.connect(self.on_row_double_clicked)
        
        table_layout.addWidget(self.account_table)
        layout.addWidget(table_panel, 1)
        
        # ========== 状态栏 ==========
        status_layout = QHBoxLayout()
        self.status_label = QLabel("显示 0 / 0")
        self.status_label.setObjectName("FooterInfo")
        self.running_label = QLabel("运行中: 0")
        self.running_label.setObjectName("FooterInfo")
        status_layout.addWidget(self.status_label)
        status_layout.addWidget(self.running_label)
        status_layout.addStretch()
        
        layout.addLayout(status_layout)

    def create_metric_card(self, title: str, value: str) -> QFrame:
        card = QFrame()
        card.setObjectName("SummaryCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(18, 16, 18, 16)
        card_layout.setSpacing(6)

        title_label = QLabel(title)
        title_label.setObjectName("MetricTitle")
        card_layout.addWidget(title_label)

        value_label = QLabel(value)
        value_label.setObjectName("MetricValue")
        card_layout.addWidget(value_label)

        card.value_label = value_label
        return card

    def load_accounts(self):
        """加载桌面版本地账号列表。"""
        self.account_manager.load_from_file(self.storage_path)
        self.account_manager.reset_all_status()

    def persist_accounts(self):
        """保存桌面版本地账号列表。"""
        self.account_manager.save_to_file(self.storage_path)

    def add_account(self):
        """添加账号"""
        dialog = AddAccountDialog(self)
        if dialog.exec_() == QDialog.DialogCode.Accepted:
            username, password, nickname = dialog.get_values()
            
            if not username or not password:
                QMessageBox.warning(self, "警告", "用户名和密码不能为空")
                return
            
            if self.account_manager.add_account(username, password, nickname):
                self.persist_accounts()
                self.refresh_table()
                QMessageBox.information(self, "成功", "账号添加成功")
            else:
                QMessageBox.warning(self, "警告", "该账号已存在")
    
    def import_accounts(self):
        """从文件导入账号"""
        filepath, _ = QFileDialog.getOpenFileName(
            self, "选择账号文件", "", "文本文件 (*.txt);;CSV文件 (*.csv)"
        )
        
        if filepath:
            count, error = self.account_manager.import_from_file(filepath)
            if error:
                QMessageBox.warning(self, "导入失败", error)
            else:
                self.persist_accounts()
                self.refresh_table()
                QMessageBox.information(self, "导入成功", f"成功导入 {count} 个账号")
    
    def export_accounts(self):
        """导出账号到文件"""
        if self.account_manager.get_account_count() == 0:
            QMessageBox.warning(self, "警告", "没有账号可导出")
            return
        
        filepath, _ = QFileDialog.getSaveFileName(
            self, "保存账号文件", "accounts.txt", "文本文件 (*.txt);;CSV文件 (*.csv)"
        )
        
        if filepath:
            success, error = self.account_manager.export_to_file(filepath)
            if success:
                QMessageBox.information(self, "成功", "账号导出成功")
            else:
                QMessageBox.warning(self, "导出失败", error)
    
    def delete_selected(self):
        """删除选中的账号"""
        selected_rows = self.account_table.selectionModel().selectedRows()
        if not selected_rows:
            QMessageBox.warning(self, "警告", "请先选择要删除的账号")
            return
        
        reply = QMessageBox.question(
            self, "确认", f"确定要删除选中的 {len(selected_rows)} 个账号吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # 从后往前删，避免索引问题
            for index in sorted(selected_rows, reverse=True):
                row = index.row()
                username = self.account_table.item(row, 0).text()
                self.account_manager.remove_account(username)
            self.persist_accounts()
            self.refresh_table()
    
    def on_row_double_clicked(self, index):
        """双击行打开详情"""
        row = index.row()
        username = self.account_table.item(row, 0).text()
        account = self.account_manager.get_account(username)
        if account:
            self.open_detail_requested.emit(account)
    
    def refresh_table(self):
        """刷新账号表格"""
        accounts = self.account_manager.get_all_accounts()
        query = self.search_input.text().strip().lower() if hasattr(self, "search_input") else ""
        filtered_accounts = []

        for acc in accounts:
            target_course = getattr(acc, "target_course_name", None) or ""
            if query and not any(
                query in value.lower()
                for value in [acc.username, acc.nickname or "", target_course]
            ):
                continue
            filtered_accounts.append(acc)

        self.account_table.setRowCount(len(filtered_accounts))

        for i, acc in enumerate(filtered_accounts):
            # 用户名
            self.account_table.setItem(i, 0, QTableWidgetItem(acc.username))
            # 昵称
            self.account_table.setItem(i, 1, QTableWidgetItem(acc.nickname or "-"))
            # 状态
            status_item = QTableWidgetItem(acc.status)
            if acc.status == "运行中":
                status_item.setForeground(Qt.GlobalColor.blue)
            elif acc.status == "已完成":
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif acc.status == "失败":
                status_item.setForeground(Qt.GlobalColor.red)
            self.account_table.setItem(i, 2, status_item)
            # 目标课程
            target_course = getattr(acc, 'target_course_name', None) or "自动"
            self.account_table.setItem(i, 3, QTableWidgetItem(target_course))
            # 进度
            self.account_table.setItem(i, 4, QTableWidgetItem(acc.progress or "-"))
            # 操作按钮
            manage_btn = QPushButton("管理")
            manage_btn.setProperty("username", acc.username)
            manage_btn.clicked.connect(self.on_manage_clicked)
            self.account_table.setCellWidget(i, 5, manage_btn)
        
        # 更新状态栏
        total_running = sum(1 for acc in accounts if acc.status == "运行中")
        total_completed = sum(1 for acc in accounts if acc.status == "已完成")
        self.total_card.value_label.setText(str(len(accounts)))
        self.running_card.value_label.setText(str(total_running))
        self.completed_card.value_label.setText(str(total_completed))
        self.status_label.setText(f"显示 {len(filtered_accounts)} / {len(accounts)}")
        self.running_label.setText(f"运行中: {total_running}")

    def on_manage_clicked(self):
        """管理按钮点击"""
        btn = self.sender()
        username = btn.property("username")
        account = self.account_manager.get_account(username)
        if account:
            self.open_detail_requested.emit(account)
    
    def update_account_status(self, username: str, status: str, progress: str = ""):
        """更新账号状态（供外部调用）"""
        self.account_manager.update_status(username, status, progress)
        self.refresh_table()
