"""Track successful invitation delivery for safe retries."""

from alembic import op
import sqlalchemy as sa

revision = "20261014_0007"
down_revision = "20260915_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invitations", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    # Delivery was not tracked before this migration. Treat existing invitations
    # as delivered so a retry cannot invalidate a token already sent by email.
    op.execute("UPDATE invitations SET delivered_at = created_at")


def downgrade() -> None:
    op.drop_column("invitations", "delivered_at")
